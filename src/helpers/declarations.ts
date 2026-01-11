import type { Result } from "./result";
import type { Binding } from "./types";
import {
  parseLeadingNumber,
  validateSizedInteger,
  findTopLevelChar,
  isIdentifierName,
} from "../parsers/interpretHelpers";
import {
  checkSimpleAnnotation,
  handleNumericSuffixAnnotation,
  scanExpressionSuffix,
  substituteAllIdents,
} from "../parsers/interpretHelpers";
import { interpret } from "../core/interpret";
import { lookupStruct } from "../helpers/structHelpers";

export function evaluateAnnotationExpression(
  annText: string,
  expectedValue: number,
  env: Map<string, Binding>
): Result<string | undefined, string> {
  // substitute identifiers in the annotation expression using current env
  const subRes = substituteAllIdents(annText, env);
  if (!subRes.ok) return { ok: false, error: subRes.error };
  const valRes = interpret(subRes.value, env);
  if (!valRes.ok) return { ok: false, error: valRes.error };
  if (valRes.value !== expectedValue)
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  const scanRes = scanExpressionSuffix(subRes.value);
  if (!scanRes.ok) return { ok: false, error: scanRes.error };
  if (scanRes.value) {
    const rangeErr = validateSizedInteger(String(expectedValue), scanRes.value);
    if (rangeErr) return rangeErr;
  }
  return { ok: true, value: scanRes.value };
}

export function deriveAnnotationSuffixBetween(
  stmt: string,
  colonPos: number,
  eq: number,
  rhs: string,
  init: Binding,
  env: Map<string, Binding>
): Result<string | undefined, string> {
  if (colonPos === -1 || colonPos >= eq) return { ok: true, value: undefined };
  const annText = stmt.slice(colonPos + 1, eq).trim();
  const parsedAnn = parseLeadingNumber(annText);

  // If this looks like a function type annotation '(...) => ...', skip expression evaluation
  if (annText.indexOf("=>") !== -1) return { ok: true, value: undefined };

  const simpleCheck = checkSimpleAnnotation(annText, parsedAnn, rhs, init);
  if (simpleCheck !== undefined) return simpleCheck;

  // annotation like '3I32' (numeric prefix + suffix) — handle specially
  if (parsedAnn && parsedAnn.end < annText.length) {
    const rest = annText.slice(parsedAnn.end).trim();
    const numSuffixRes = handleNumericSuffixAnnotation(
      parsedAnn.value,
      rest,
      init.value
    );
    if (numSuffixRes.ok) return numSuffixRes;
    // not a simple numeric+suffix annotation — fallthrough to expression analysis
  }

  // otherwise treat as an expression and evaluate+scan
  const exprRes = evaluateAnnotationExpression(annText, init.value, env);
  if (!exprRes.ok) return { ok: false, error: exprRes.error };
  return exprRes;
}

export interface FunctionTypeAnnotation {
  paramTypes: string[];
  retType: string;
}

// Parse a function type annotation like '(I32, I32) => I32'
export function parseFunctionTypeAnnotation(
  text: string
): FunctionTypeAnnotation | undefined {
  const t = text.trim();
  if (!t.startsWith("(")) return undefined;
  let depth = 0;
  let i = 0;
  for (; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (i >= t.length || t[i] !== ")") return undefined;
  const paramsText = t.slice(1, i).trim();
  const rest = t.slice(i + 1).trim();
  if (!rest.startsWith("=>")) return undefined;
  const ret = rest.slice(2).trim();
  const paramTypes = paramsText.length
    ? paramsText.split(",").map((p) => p.trim())
    : [];
  return { paramTypes, retType: ret };
}

function handleFinalizeAnnotation(
  stmt: string,
  colonPos: number,
  eq: number,
  rhs: string,
  init: Binding,
  env: Map<string, Binding>
): Result<string | undefined, string> {
  const doDerive = (): Result<string | undefined, string> => {
    const annRes = deriveAnnotationSuffixBetween(
      stmt,
      colonPos,
      eq,
      rhs,
      init,
      env
    );
    if (!annRes.ok) return { ok: false, error: annRes.error };
    return annRes;
  };

  if (colonPos === -1 || colonPos >= eq) return doDerive();

  const annText = stmt.slice(colonPos + 1, eq).trim();
  const fnAnn = parseFunctionTypeAnnotation(annText);
  if (fnAnn) {
    if (!init.fn)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    if (fnAnn.paramTypes.length !== init.fn.params.length)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    for (let i = 0; i < fnAnn.paramTypes.length; i++) {
      const expected = fnAnn.paramTypes[i];
      const actual = init.fn.params[i].ann;
      if (actual && actual !== expected)
        return {
          ok: false,
          error: "declaration initializer does not match annotation",
        };
    }
    return { ok: true, value: undefined };
  }

  // Struct type annotation like 'Point' — accept when initializer is a struct with the same type name
  const structCheck = handleStructAnnotation(annText, init);
  if (structCheck) return structCheck;

  return doDerive();
}

function handleStructAnnotation(
  annText: string,
  init: Binding
): Result<void, string> | undefined {
  if (!isIdentifierName(annText)) return undefined;
  const sres = lookupStruct(annText);
  if (!sres.ok) return undefined;
  if (!init.struct)
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  if (init.struct.typeName !== annText)
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  return { ok: true, value: undefined };
}

export function finalizeInitializedDeclaration(
  stmt: string,
  ident: string,
  p: number,
  eq: number,
  rhs: string,
  init: Binding,
  env: Map<string, Binding>,
  isMutable: boolean
): Result<void, string> {
  // check annotation (optional) between identifier end and '=': e.g., ': 2U8' or ': U8'
  const colonPos = findTopLevelChar(stmt, p, ":");

  const annRes = handleFinalizeAnnotation(stmt, colonPos, eq, rhs, init, env);
  if (!annRes.ok) return { ok: false, error: annRes.error };

  const annSuffix = annRes.value;

  if (env.has(ident)) return { ok: false, error: "duplicate declaration" };

  const finalSuffix = init.suffix ?? annSuffix;
  // initialized binding: assigned = true; mutability preserved
  const bindingToSet: Binding = {
    ...init,
    value: init.value,
    suffix: finalSuffix,
    assigned: true,
    mutable: isMutable,
    fn: init.fn,
  };
  // preserve any struct property present in init
  if (init.struct) bindingToSet.struct = init.struct;
  env.set(ident, bindingToSet);
  return { ok: true, value: undefined };
}
