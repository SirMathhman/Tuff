import type { Result, Err } from "./result";
import {
  parseLeadingNumber,
  validateSizedInteger,
  splitStatements,
  findTopLevelChar,
} from "./interpretHelpers";

import { handleAddSubChain, handleSingle, setInterpreterFns } from "./arith";
import {
  substituteAllIdents,
  substituteTopLevelIdents,
  findMatchingParenIndex,
  isIdentCharCode,
  isIdentifierOnly,
  scanExpressionSuffix,
  deriveAnnotationSuffixForNoInit,
  handleNumericSuffixAnnotation,
  checkSimpleAnnotation,
} from "./interpretHelpers";

interface Binding {
  value: number;
  suffix?: string;
}

interface ScanIdentResult {
  ident: string;
  nextPos: number;
}

function scanIdentifierFrom(
  stmt: string,
  start: number
): ScanIdentResult | undefined {
  let p = start;
  while (p < stmt.length) {
    const c = stmt.charCodeAt(p);
    if (isIdentCharCode(c)) p++;
    else break;
  }
  const ident = stmt.slice(start, p);
  return ident ? { ident, nextPos: p } : undefined;
}

function lookupBinding(
  name: string,
  env: Map<string, Binding>,
  fallbackEnv?: Map<string, Binding>
): Result<Binding, string> {
  const binding = env.get(name);
  if (binding) return { ok: true, value: binding };
  if (fallbackEnv) return lookupBinding(name, fallbackEnv);
  return { ok: false, error: `unknown identifier ${name}` };
}

function findBindingEnv(
  name: string,
  env: Map<string, Binding>,
  fallbackEnv?: Map<string, Binding>
): Map<string, Binding> | undefined {
  if (env.has(name)) return env;
  if (fallbackEnv && fallbackEnv.has(name)) return fallbackEnv;
  return undefined;
}

function parseBooleanLiteral(t: string): Binding | undefined {
  if (t === "true" || t === "false") return { value: t === "true" ? 1 : 0 };
  return undefined;
}

function resolveInitializer(
  rhs: string,
  env: Map<string, Binding>
): Result<Binding, string> {
  const t = rhs.trim();

  const boolLit = parseBooleanLiteral(t);
  if (boolLit) return { ok: true, value: boolLit };

  // identifier initializer
  if (isIdentifierOnly(t)) {
    const name = t.split(" ")[0];
    return lookupBinding(name, env);
  }

  if (t.startsWith("{")) {
    const brRes = parseBracedInitializer(t, env);
    if (!brRes.ok) return brRes as Result<Binding, string>;
    return brRes;
  }

  const err = validateIfIdentifierConditions(rhs, env);
  if (err) return err;

  const subAll = substituteAllIdents(rhs, env);
  if (!subAll.ok) return { ok: false, error: subAll.error };
  const r = interpret(subAll.value);
  if (!r.ok) return { ok: false, error: r.error };
  const parsedNum = parseLeadingNumber(subAll.value);
  const suffix =
    parsedNum && parsedNum.end < subAll.value.length
      ? subAll.value.slice(parsedNum.end)
      : undefined;
  return { ok: true, value: { value: r.value, suffix } };
}

function parseBracedInitializer(
  t: string,
  env: Map<string, Binding>
): Result<Binding, string> {
  // find matching top-level closing brace
  let depth = 0;
  let i = 0;
  while (i < t.length) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  if (i >= t.length || t[i] !== "}")
    return { ok: false, error: "unmatched brace in initializer" };
  // only allow pure braced block (no trailing tokens)
  const rest = t.slice(i + 1).trim();
  if (rest.length !== 0)
    return { ok: false, error: "unexpected tokens after braced initializer" };

  const inner = t.slice(1, i);
  const innerRes = evaluateBlock(inner, env);
  if (!innerRes.ok) return innerRes as Result<Binding, string>;
  const binding: Binding = { value: innerRes.value };
  return { ok: true, value: binding };
}

interface SingleIfValidateResult {
  err?: Err<string>;
  nextPos?: number;
}

function validateSingleIfAtIndex(
  rhs: string,
  i: number,
  env: Map<string, Binding>
): SingleIfValidateResult {
  let j = i + 2;
  while (j < rhs.length && rhs[j] === " ") j++;
  if (j >= rhs.length || rhs[j] !== "(")
    return { err: { ok: false, error: "invalid conditional expression" } };
  const k = findMatchingParenIndex(rhs, j);
  if (k === -1) return { err: { ok: false, error: "unmatched parenthesis" } };
  const condText = rhs.slice(j + 1, k).trim();
  if (
    isIdentifierOnly(condText) &&
    condText !== "true" &&
    condText !== "false"
  ) {
    const name = condText.split(" ")[0];
    const b = lookupBinding(name, env);
    if (!b.ok) return { err: { ok: false, error: b.error } };
    if (!(b.value.value === 0 || b.value.value === 1))
      return { err: { ok: false, error: "invalid conditional expression" } };
  }
  return { nextPos: k + 1 };
}

function validateIfIdentifierConditions(
  rhs: string,
  env: Map<string, Binding>
): Err<string> | undefined {
  if (rhs.indexOf("if(") === -1 && rhs.indexOf("if (") === -1) return undefined;
  let i = 0;
  let depth = 0;
  while (i < rhs.length) {
    const ch = rhs[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      i++;
      continue;
    }
    if (
      depth === 0 &&
      rhs.startsWith("if", i) &&
      (rhs[i + 2] === " " || rhs[i + 2] === "(")
    ) {
      const res = validateSingleIfAtIndex(rhs, i, env);
      if (res.err) return res.err;
      i = res.nextPos!;
      continue;
    }
    i++;
  }
  return undefined;
}

function evaluateAnnotationExpression(
  annText: string,
  expectedValue: number,
  env: Map<string, Binding>
): Result<string | undefined, string> {
  // substitute identifiers in the annotation expression using current env
  const subRes = substituteAllIdents(annText, env);
  if (!subRes.ok) return subRes as Err<string>;
  const valRes = interpret(subRes.value);
  if (!valRes.ok) return { ok: false, error: valRes.error };
  if (valRes.value !== expectedValue)
    return { ok: false, error: "declaration initializer does not match annotation" };
  const scanRes = scanExpressionSuffix(subRes.value);
  if (!scanRes.ok) return scanRes as Err<string>;
  if (scanRes.value) {
    const rangeErr = validateSizedInteger(String(expectedValue), scanRes.value);
    if (rangeErr) return rangeErr;
  }
  return { ok: true, value: scanRes.value };
}


function deriveAnnotationSuffixBetween(
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
  if (!exprRes.ok) return exprRes as Err<string>;
  return exprRes;
}



function parseDeclaration(
  stmt: string,
  env: Map<string, Binding>
): Result<void, string> {
  let p = 4;
  while (p < stmt.length && stmt[p] === " ") p++;
  const start = p;

  const scan = scanIdentifierFrom(stmt, start);
  if (!scan) return { ok: false, error: "invalid declaration" };
  const ident = scan.ident;
  p = scan.nextPos;

  const eq = findTopLevelChar(stmt, p, "=");
  // no initializer: allow annotation-only declarations like 'let x : I32'
  if (eq === -1) {
    const colonPos = findTopLevelChar(stmt, p, ":");
    const maybeSuffix = deriveAnnotationSuffixForNoInit(stmt, colonPos);
    if (!maybeSuffix.ok) return maybeSuffix as Err<string>;
    const suffix = maybeSuffix.value;

    if (env.has(ident)) return { ok: false, error: "duplicate declaration" };
    env.set(ident, { value: 0, suffix });
    return { ok: true, value: undefined };
  }

  const rhs = stmt.slice(eq + 1).trim();

  const init = resolveInitializer(rhs, env);
  if (!init.ok) return init as Err<string>;

  // check annotation (optional) between identifier end and '=': e.g., ': 2U8' or ': U8'
  const colonPos = findTopLevelChar(stmt, p, ":");
  const annRes = deriveAnnotationSuffixBetween(
    stmt,
    colonPos,
    eq,
    rhs,
    init.value,
    env
  );
  if (!annRes.ok) return annRes as Err<string>;
  const annSuffix = annRes.value;

  if (env.has(ident)) return { ok: false, error: "duplicate declaration" };

  const finalSuffix = init.value.suffix ?? annSuffix;
  env.set(ident, { value: init.value.value, suffix: finalSuffix });
  return { ok: true, value: undefined };
}

interface BracedPrefixResult {
  rest?: string;
  value?: number;
}

function handleBracedPrefix(
  stmt: string,
  env: Map<string, Binding>
): Result<BracedPrefixResult, string> {
  const t = stmt.trim();
  let depth = 0;
  let idx = -1;
  for (let k = 0; k < t.length; k++) {
    if (t[k] === "{") depth++;
    else if (t[k] === "}") {
      depth--;
      if (depth === 0) {
        idx = k;
        break;
      }
    }
  }
  if (idx === -1)
    return { ok: false, error: "unmatched brace in block statement" };
  const inner = t.slice(1, idx);
  const rest = t.slice(idx + 1).trim();
  const innerRes = evaluateBlock(inner, env);
  if (innerRes.ok) {
    return {
      ok: true,
      value: { rest: rest || undefined, value: innerRes.value },
    };
  }

  // permit braced statement blocks that only contain declarations (no final expr)
  // when used as a statement: treat as handled with no resulting value
  if (innerRes.error === "block has no final expression") {
    return { ok: true, value: { rest: rest || undefined } };
  }

  return innerRes as Err<string>;
}

function handleIdentifierStmt(
  stmt: string,
  env: Map<string, Binding>,
  parentEnv?: Map<string, Binding>,
  isLast = false
): Result<number, string> | true | undefined {
  if (!isIdentifierOnly(stmt)) return undefined;
  const name = stmt.split(" ")[0];
  const b = lookupBinding(name, env, parentEnv);
  if (!b.ok) return b as Err<string>;
  if (isLast) return { ok: true, value: b.value.value };
  return true;
}

function processAssignmentIfAnyStmt(
  s: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | undefined {
  const assignRes = handleAssignmentIfAny(s, envLocal, parentEnvLocal);
  if (assignRes) {
    if (!assignRes.ok) return assignRes;
    if (isLast) return assignRes;
    return "handled";
  }
  return undefined;
}

interface StripPrefixResult {
  stmt?: string;
  handled?: true;
  value?: number;
}

function stripLeadingBracedPrefixes(
  stmt: string,
  envLocal: Map<string, Binding>,
  isLast = false
): Result<StripPrefixResult, string> {
  let cur = stmt;
  while (cur.trim().startsWith("{")) {
    const brRes = handleBracedPrefix(cur, envLocal);
    if (!brRes.ok) return brRes;
    const { rest, value } = brRes.value;
    if (!rest) {
      if (isLast) {
        if (value !== undefined) return { ok: true, value: { value } };
        return { ok: true, value: { handled: true } };
      }
      return { ok: true, value: { handled: true } };
    }
    cur = rest;
  }
  return { ok: true, value: { stmt: cur } };
}

function processStatement(
  origStmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | undefined {
  let stmt = origStmt;

  if (stmt.startsWith("let ")) {
    const r = parseDeclaration(stmt, envLocal);
    if (!r.ok) return r as Err<string>;
    return "handled";
  }

  const prefixRes = stripLeadingBracedPrefixes(stmt, envLocal, isLast);
  if (!prefixRes.ok) return prefixRes;
  if (prefixRes.value.handled) return "handled";
  if (prefixRes.value.value !== undefined && isLast)
    return { ok: true, value: prefixRes.value.value };
  if (prefixRes.value.stmt) stmt = prefixRes.value.stmt;

  const assignHandled = processAssignmentIfAnyStmt(
    stmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (assignHandled) {
    if (assignHandled === "handled") return "handled";
    return assignHandled;
  }

  const identHandled = handleIdentifierStmt(
    stmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (identHandled) {
    if (identHandled === true) return "handled";
    return identHandled;
  }

  const subRes = substituteTopLevelIdents(stmt, envLocal, parentEnvLocal);
  if (!subRes.ok) return subRes as Err<string>;
  const exprRes = interpret(subRes.value);
  if (!exprRes.ok) return exprRes;
  if (isLast) return exprRes;

  return "handled";
}

function evaluateBlock(
  inner: string,
  parentEnv?: Map<string, Binding>
): Result<number, string> {
  const stmts = splitStatements(inner);
  const env = new Map<string, Binding>();
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (stmt.length === 0) continue;
    const res = processStatement(stmt, env, parentEnv, i === stmts.length - 1);
    if (res === "handled") continue;
    if (res) return res;
  }
  return { ok: false, error: "block has no final expression" };
}

function handleAssignmentIfAny(
  stmt: string,
  env: Map<string, Binding>,
  parentEnv?: Map<string, Binding>
): Result<number, string> | undefined {
  const eqPos = findTopLevelChar(stmt, 0, "=");
  if (eqPos === -1) return undefined;
  const lhs = stmt.slice(0, eqPos).trim();
  if (!isIdentifierOnly(lhs))
    return { ok: false, error: "invalid assignment LHS" };
  const name = lhs.split(" ")[0];
  const rhs = stmt.slice(eqPos + 1).trim();
  const init = resolveInitializer(rhs, env);
  if (!init.ok) return init as Err<string>;
  const targetEnv = findBindingEnv(name, env, parentEnv);
  if (!targetEnv) return { ok: false, error: `unknown identifier ${name}` };
  const existing = targetEnv.get(name)!;
  // validate against existing suffix if present
  if (existing.suffix) {
    if (existing.suffix === "Bool") {
      if (!(init.value.value === 0 || init.value.value === 1))
        return {
          ok: false,
          error: "declaration initializer does not match annotation",
        };
    } else {
      const err = validateSizedInteger(
        String(init.value.value),
        existing.suffix
      );
      if (err) return err;
    }
  }
  // propagate suffix if existing has none
  if (!existing.suffix && init.value.suffix)
    existing.suffix = init.value.suffix;
  existing.value = init.value.value;
  return { ok: true, value: existing.value };
}

export function interpret(input: string): Result<number, string> {
  const s = input.trim();

  // boolean literals
  if (s === "true") return { ok: true, value: 1 };
  if (s === "false") return { ok: true, value: 0 };

  // Top-level block statements (e.g., "let x = 2; x")
  // Only treat as a block if a semicolon exists at top level or it starts with 'let '
  if (findTopLevelChar(s, 0, ";") !== -1 || s.startsWith("let ")) {
    return evaluateBlock(s);
  }

  // binary operators: + - * / (supports chained expressions) and 'if' expression
  if (
    s.indexOf("+") !== -1 ||
    s.indexOf("-") !== -1 ||
    s.indexOf("*") !== -1 ||
    s.indexOf("/") !== -1 ||
    s.indexOf("&&") !== -1 ||
    s.indexOf("||") !== -1 ||
    s.startsWith("if ") ||
    s.startsWith("if(")
  ) {
    return handleAddSubChain(s);
  }

  return handleSingle(s);
}

// register interpreter functions for arithmetic helpers
setInterpreterFns(interpret, evaluateBlock);
