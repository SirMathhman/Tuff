import type { Result, Err } from "./result";
import {
  parseLeadingNumber,
  validateSizedInteger,
  checkAnnotationMatch,
  splitStatements,
  findTopLevelChar,
} from "./interpretHelpers";

const SIZED_TYPES = new Set([
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
]);

/**
 * interpret - parse and evaluate the given string input and return a Result
 *
 * Current behavior (stub + incremental implementation):
 *  - If the input is a numeric literal (integer or decimal, optional +/-) it
 *    returns the numeric value.
 *  - For any other input it returns 0 for now (keeps previous tests passing).
 */

import { handleAddSubChain, handleSingle, setInterpreterFns } from "./arith";

interface Binding {
  value: number;
  suffix?: string;
}

function isIdentCharCode(c: number): boolean {
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95
  );
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

function resolveInitializer(
  rhs: string,
  env: Map<string, Binding>
): Result<Binding, string> {
  const t = rhs.trim();

  // identifier initializer
  if (isIdentifierOnly(t)) {
    const name = t.split(" ")[0];
    return lookupBinding(name, env);
  }

  // braced block initializer: { ... }
  if (t.startsWith("{")) {
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

  // otherwise interpret as an expression
  const r = interpret(rhs);
  if (!r.ok) return { ok: false, error: r.error };
  const parsedNum = parseLeadingNumber(rhs);
  const suffix =
    parsedNum && parsedNum.end < rhs.length
      ? rhs.slice(parsedNum.end)
      : undefined;
  const binding: Binding = { value: r.value, suffix };
  return { ok: true, value: binding };
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
    let suffix: string | undefined;
    if (colonPos !== -1 && colonPos < stmt.length) {
      const annText = stmt.slice(colonPos + 1).trim();
      if (SIZED_TYPES.has(annText)) suffix = annText;
      else return { ok: false, error: "invalid declaration" };
    }

    if (env.has(ident)) return { ok: false, error: "duplicate declaration" };
    env.set(ident, { value: 0, suffix });
    return { ok: true, value: undefined };
  }

  const rhs = stmt.slice(eq + 1).trim();

  const init = resolveInitializer(rhs, env);
  if (!init.ok) return init as Err<string>;

  // check annotation (optional) between identifier end and '=': e.g., ': 2U8' or ': U8'
  const colonPos = findTopLevelChar(stmt, p, ":");
  if (colonPos !== -1 && colonPos < eq) {
    const annText = stmt.slice(colonPos + 1, eq).trim();
    const annErr = checkAnnotationMatch(
      annText,
      rhs,
      init.value.value,
      init.value.suffix
    );
    if (annErr) return annErr;
  }

  if (env.has(ident)) return { ok: false, error: "duplicate declaration" };

  env.set(ident, { value: init.value.value, suffix: init.value.suffix });
  return { ok: true, value: undefined };
}

function isIdentifierOnly(stmt: string): boolean {
  // Trim leading/trailing space first
  const t = stmt.trim();
  if (t.length === 0) return false;

  // first character must be a letter or underscore
  const first = t.charCodeAt(0);
  if (
    !(
      (first >= 65 && first <= 90) ||
      (first >= 97 && first <= 122) ||
      first === 95
    )
  )
    return false;

  // subsequent characters may be letters, digits, or underscore
  for (let k = 1; k < t.length; k++) {
    const c = t.charCodeAt(k);
    if (
      !(
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 95
      )
    )
      return false;
  }
  return true;
}

interface BracedPrefixResult {
  rest?: string;
  value: number;
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
  if (idx === -1) return { ok: false, error: "unmatched brace in block statement" };
  const inner = t.slice(1, idx);
  const rest = t.slice(idx + 1).trim();
  const innerRes = evaluateBlock(inner, env);
  if (!innerRes.ok) return innerRes as Err<string>;
  return { ok: true, value: { rest: rest || undefined, value: innerRes.value } };
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

  // assignment handled by helper
  const assignRes = handleAssignmentIfAny(stmt, envLocal, parentEnvLocal);
  if (assignRes) {
    if (!assignRes.ok) return assignRes;
    if (isLast) return assignRes;
    return "handled";
  }

  // handle leading braced blocks (may have trailing tokens)
  while (stmt.trim().startsWith("{")) {
    const brRes = handleBracedPrefix(stmt, envLocal);
    if (!brRes.ok) return brRes;
    const { rest, value } = brRes.value;
    if (!rest) {
      if (isLast) return { ok: true, value };
      return "handled";
    }
    stmt = rest;
  }

  const identHandled = handleIdentifierStmt(stmt, envLocal, parentEnvLocal, isLast);
  if (identHandled) {
    if (identHandled === true) return "handled";
    return identHandled;
  }

  const exprRes = interpret(stmt);
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
    const err = validateSizedInteger(String(init.value.value), existing.suffix);
    if (err) return err;
  }
  // propagate suffix if existing has none
  if (!existing.suffix && init.value.suffix)
    existing.suffix = init.value.suffix;
  existing.value = init.value.value;
  return { ok: true, value: existing.value };
}



export function interpret(input: string): Result<number, string> {
  const s = input.trim();

  // Top-level block statements (e.g., "let x = 2; x")
  // Only treat as a block if a semicolon exists at top level or it starts with 'let '
  if (findTopLevelChar(s, 0, ";") !== -1 || s.startsWith("let ")) {
    return evaluateBlock(s);
  }

  // binary operators: + - * / (supports chained expressions)
  if (
    s.indexOf("+") !== -1 ||
    s.indexOf("-") !== -1 ||
    s.indexOf("*") !== -1 ||
    s.indexOf("/") !== -1
  ) {
    return handleAddSubChain(s);
  }

  return handleSingle(s);
}

// register interpreter functions for arithmetic helpers
setInterpreterFns(interpret, evaluateBlock);
