import { Env, envGet, envSet, envHas } from "../runtime/env";
import {
  parseArrayAnnotation,
  parseSliceAnnotation,
  cloneArrayInstance,
  makeArrayInstance,
  parseOperand,
  findMatchingParen,
} from "../interpreter_helpers";
import {
  isPlainObject,
  isIntOperand,
  isArrayInstance,
  getProp,
  type RuntimeValue,
} from "../runtime/types";
import { validateAnnotation } from "../interpreter_helpers";

export interface LetContext {
  localEnv: Env;
  declared: Set<string>;
  evaluateRhsLocal: (rhs: string, envLocal: Env) => RuntimeValue;
  evaluateReturningOperand: (expr: string, envLocal: Env) => RuntimeValue;
}

interface LetDeclarationInfo {
  name: string;
  mutFlag: boolean;
  annotation: string | undefined;
}

export interface HandleLetResult {
  handled: true;
  last: RuntimeValue;
}

export interface HandleLetNoMatch {
  handled: false;
}

export function handleLetStatement(
  stmt: string,
  ctx: LetContext
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
  if (ctx.declared.has(name)) throw new Error("duplicate declaration");

  if (!hasInitializer) {
    return handleLetWithoutInitializer({ name, mutFlag, annotation }, ctx);
  } else {
    return handleLetWithInitializer(
      { name, mutFlag, annotation },
      rhsRaw!,
      ctx
    );
  }
}

function handleLetWithoutInitializer(
  decl: LetDeclarationInfo,
  ctx: LetContext
): HandleLetResult {
  // validate annotation shape (if present)
  let parsedAnn: RuntimeValue = undefined;
  let literalAnnotation = false;
  if (decl.annotation) {
    const annText = resolveTypeAliasIfNeeded(decl.annotation, ctx.localEnv);

    const arrAnn =
      typeof annText === "string" ? parseArrayAnnotation(annText) : undefined;
    if (arrAnn) {
      return handleArrayDeclarationWithoutInitializer(decl, ctx, arrAnn);
    }

    const parsed = parseNonArrayAnnotation(annText);
    if (parsed) {
      parsedAnn = parsed.ann;
      literalAnnotation = parsed.literal;
    }
  }

  ctx.declared.add(decl.name);
  // store placeholder so assignments later can validate annotations
  envSet(ctx.localEnv, decl.name, {
    uninitialized: true,
    annotation: decl.annotation,
    parsedAnnotation: parsedAnn,
    literalAnnotation,
    mutable: decl.mutFlag,
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
  decl: LetDeclarationInfo,
  ctx: LetContext,
  arrAnn: ReturnType<typeof parseArrayAnnotation>
): HandleLetResult {
  if (!arrAnn) throw new Error("invalid array annotation");
  if (arrAnn.initCount !== 0)
    throw new Error(
      "array declaration without initializer requires init count 0"
    );
  const arrInst = makeArrayInstance(arrAnn);
  ctx.declared.add(decl.name);
  if (decl.mutFlag)
    envSet(ctx.localEnv, decl.name, {
      mutable: true,
      value: arrInst,
      annotation: decl.annotation,
    });
  else envSet(ctx.localEnv, decl.name, arrInst);
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
    const endIdx = findMatchingParen(rhs, {
      start: braceStart,
      open: "{",
      close: "}",
    });
    if (endIdx !== -1 && endIdx < rhs.length - 1) {
      trailingExpr = rhs.slice(endIdx + 1).trim();
      rhs = rhs.slice(0, endIdx + 1).trim();
    }
  }
  return { rhs, trailingExpr };
}

function validateLetAnnotation(
  annotation: string,
  rhsOperand: RuntimeValue,
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
  decl: LetDeclarationInfo,
  rhsRaw: string,
  ctx: LetContext
): HandleLetResult {
  const { rhs, trailingExpr } = splitTrailingExprAfterBracedBlock(rhsRaw);
  const rhsOperand = ctx.evaluateRhsLocal(rhs, ctx.localEnv);

  if (decl.annotation) {
    validateLetAnnotation(decl.annotation, rhsOperand, ctx.localEnv);
  }

  ctx.declared.add(decl.name);
  // If RHS is an array instance, clone it to enforce copy-on-assignment
  const valToStore = isArrayInstance(rhsOperand)
    ? cloneArrayInstance(rhsOperand)
    : rhsOperand;
  if (decl.mutFlag) {
    // store as mutable wrapper so future assignments update .value
    envSet(ctx.localEnv, decl.name, {
      mutable: true,
      value: valToStore,
      annotation: decl.annotation,
    });
  } else {
    envSet(ctx.localEnv, decl.name, valToStore);
  }

  // If we split off a trailing expression, evaluate it now and use it as `last`
  if (trailingExpr) {
    const last = ctx.evaluateReturningOperand(trailingExpr, ctx.localEnv);
    return { handled: true, last };
  } else {
    return { handled: true, last: undefined };
  }
}
