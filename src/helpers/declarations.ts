import type { Result } from "./result";
import {
  parseLeadingNumber,
  validateSizedInteger,
  findTopLevelChar,
} from "../parsers/interpretHelpers";
import {
  checkSimpleAnnotation,
  handleNumericSuffixAnnotation,
  scanExpressionSuffix,
  substituteAllIdents,
} from "../parsers/interpretHelpers";
import { interpret } from "../core/interpret";

interface Binding {
  value: number;
  suffix?: string;
  assigned?: boolean;
  mutable?: boolean;
}

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
  const annRes = deriveAnnotationSuffixBetween(
    stmt,
    colonPos,
    eq,
    rhs,
    init,
    env
  );
  if (!annRes.ok) return { ok: false, error: annRes.error };
  const annSuffix = annRes.value;

  if (env.has(ident)) return { ok: false, error: "duplicate declaration" };

  const finalSuffix = init.suffix ?? annSuffix;
  // initialized binding: assigned = true; mutability preserved
  env.set(ident, {
    value: init.value,
    suffix: finalSuffix,
    assigned: true,
    mutable: isMutable,
  });
  return { ok: true, value: undefined };
}
