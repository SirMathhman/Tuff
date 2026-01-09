import { Env, envGet, envSet, envHas } from "../env";
import {
  parseArrayAnnotation,
  parseSliceAnnotation,
  cloneArrayInstance,
  makeArrayInstance,
  parseOperand,
  findMatchingParen,
} from "../interpret_helpers";
import {
  isPlainObject,
  isIntOperand,
  isArrayInstance,
  getProp,
} from "../types";
import { validateAnnotation } from "../interpret_helpers";

export interface HandleLetResult {
  handled: true;
  last: unknown;
}

export interface HandleLetNoMatch {
  handled: false;
}

export function handleLetStatement(
  stmt: string,
  localEnv: Env,
  declared: Set<string>,
  evaluateRhsLocal: (rhs: string, envLocal: Env) => unknown,
  evaluateReturningOperand: (expr: string, envLocal: Env) => unknown
): HandleLetResult | HandleLetNoMatch {
  if (!/^let\b/.test(stmt)) {
    const result: HandleLetNoMatch = { handled: false };
    return result;
  }

  const m = stmt.match(
    /^let\s+(mut\s+)?([a-zA-Z_]\w*)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/
  );
  if (!m) throw new Error("invalid let declaration");
  const mutFlag = !!m[1];
  const name = m[2];
  const annotation = m[3] ? m[3].trim() : undefined;
  const hasInitializer = m[4] !== undefined;
  const rhsRaw = hasInitializer && m[4] ? m[4].trim() : undefined;

  // duplicate declaration in same scope is an error
  if (declared.has(name)) throw new Error("duplicate declaration");

  if (!hasInitializer) {
    return handleLetWithoutInitializer(
      name,
      mutFlag,
      annotation,
      declared,
      localEnv
    );
  } else {
    return handleLetWithInitializer(
      name,
      mutFlag,
      annotation,
      rhsRaw!,
      declared,
      localEnv,
      evaluateRhsLocal,
      evaluateReturningOperand
    );
  }
}

function handleLetWithoutInitializer(
  name: string,
  mutFlag: boolean,
  annotation: string | undefined,
  declared: Set<string>,
  localEnv: Env
): HandleLetResult {
  // validate annotation shape (if present)
  let parsedAnn: unknown = undefined;
  let literalAnnotation = false;
  if (annotation) {
    const annText = resolveTypeAliasIfNeeded(annotation, localEnv);

    const arrAnn =
      typeof annText === "string" ? parseArrayAnnotation(annText) : undefined;
    if (arrAnn) {
      return handleArrayDeclarationWithoutInitializer(
        name,
        mutFlag,
        annotation,
        declared,
        localEnv,
        arrAnn
      );
    }

    const parsed = parseNonArrayAnnotation(annText);
    if (parsed) {
      parsedAnn = parsed.ann;
      literalAnnotation = parsed.literal;
    }
  }

  declared.add(name);
  // store placeholder so assignments later can validate annotations
  envSet(localEnv, name, {
    uninitialized: true,
    annotation,
    parsedAnnotation: parsedAnn,
    literalAnnotation,
    mutable: mutFlag,
    value: undefined,
  });
  return { handled: true, last: undefined };
}

function resolveTypeAliasIfNeeded(annText: string, localEnv: Env) {
  let resolved: string | undefined = annText;
  if (typeof resolved === "string" && envHas(localEnv, resolved)) {
    const candidate = envGet(localEnv, resolved);
    if (
      isPlainObject(candidate) &&
      getProp(candidate, "typeAlias") !== undefined
    ) {
      resolved = String(getProp(candidate, "typeAlias"));
    }
  }
  return resolved;
}

function handleArrayDeclarationWithoutInitializer(
  name: string,
  mutFlag: boolean,
  annotation: string | undefined,
  declared: Set<string>,
  localEnv: Env,
  arrAnn: ReturnType<typeof parseArrayAnnotation>
): HandleLetResult {
  if (!arrAnn) throw new Error("invalid array annotation");
  if (arrAnn.initCount !== 0)
    throw new Error(
      "array declaration without initializer requires init count 0"
    );
  const arrInst = makeArrayInstance(arrAnn);
  declared.add(name);
  if (mutFlag)
    envSet(localEnv, name, {
      mutable: true,
      value: arrInst,
      annotation,
    });
  else envSet(localEnv, name, arrInst);
  return { handled: true, last: undefined };
}

function parseNonArrayAnnotation(annText: string | undefined) {
  if (annText === undefined) return undefined;
  const typeOnly = String(annText).match(/^\s*([uUiI])\s*(\d+)\s*$/);
  if (typeOnly) return undefined;
  if (/^\s*bool\s*$/i.test(String(annText))) return undefined;

  const sliceAnn =
    typeof annText === "string" ? parseSliceAnnotation(annText) : undefined;
  if (sliceAnn) return { ann: String(annText), literal: false };

  const ann = parseOperand(String(annText));
  if (!ann) throw new Error("invalid annotation in let");
  if (!isIntOperand(ann))
    throw new Error("annotation must be integer literal with suffix");
  return { ann, literal: true };
}

function splitTrailingExprAfterBracedBlock(rhsRaw: string) {
  let rhs = rhsRaw;
  const braceStart = rhs.indexOf("{");
  let trailingExpr: string | undefined = undefined;
  if (braceStart !== -1) {
    const endIdx = findMatchingParen(rhs, braceStart, "{", "}");
    if (endIdx !== -1 && endIdx < rhs.length - 1) {
      trailingExpr = rhs.slice(endIdx + 1).trim();
      rhs = rhs.slice(0, endIdx + 1).trim();
    }
  }
  return { rhs, trailingExpr };
}

function validateLetAnnotation(
  annotation: string,
  rhsOperand: unknown,
  localEnv: Env
) {
  let resolvedAnn = annotation;
  if (typeof resolvedAnn === "string" && envHas(localEnv, resolvedAnn)) {
    const candidate = envGet(localEnv, resolvedAnn);
    if (
      isPlainObject(candidate) &&
      getProp(candidate, "typeAlias") !== undefined
    )
      resolvedAnn = String(getProp(candidate, "typeAlias"));
  }
  validateAnnotation(resolvedAnn, rhsOperand);
}

function handleLetWithInitializer(
  name: string,
  mutFlag: boolean,
  annotation: string | undefined,
  rhsRaw: string,
  declared: Set<string>,
  localEnv: Env,
  evaluateRhsLocal: (rhs: string, envLocal: Env) => unknown,
  evaluateReturningOperand: (expr: string, envLocal: Env) => unknown
): HandleLetResult {
  const { rhs, trailingExpr } = splitTrailingExprAfterBracedBlock(rhsRaw);
  const rhsOperand = evaluateRhsLocal(rhs, localEnv);

  if (annotation) {
    validateLetAnnotation(annotation, rhsOperand, localEnv);
  }

  declared.add(name);
  // If RHS is an array instance, clone it to enforce copy-on-assignment
  const valToStore = isArrayInstance(rhsOperand)
    ? cloneArrayInstance(rhsOperand)
    : rhsOperand;
  if (mutFlag) {
    // store as mutable wrapper so future assignments update .value
    envSet(localEnv, name, {
      mutable: true,
      value: valToStore,
      annotation,
    });
  } else {
    envSet(localEnv, name, valToStore);
  }

  // If we split off a trailing expression, evaluate it now and use it as `last`
  if (trailingExpr) {
    const last = evaluateReturningOperand(trailingExpr, localEnv);
    return { handled: true, last };
  } else {
    return { handled: true, last: undefined };
  }
}
