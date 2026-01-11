import type { Result, Err } from "./result";
import {
  parseLeadingNumber,
  splitStatements,
  findTopLevelChar,
} from "./interpretHelpers";

import { handleAddSubChain, handleSingle, setInterpreterFns } from "./arith";
import {
  substituteAllIdents,
  substituteTopLevelIdents,
  isIdentCharCode,
  isIdentifierOnly,
  deriveAnnotationSuffixForNoInit,
  findMatchingParenIndex,
} from "./interpretHelpers";

import {
  lookupBinding,
  findBindingEnv,
  validateIfIdentifierConditions,
} from "./ifValidators";

import {
  applyCompoundAssignment,
  applyPlainAssignment,
  type BindingLike,
} from "./assignHelpers";
import { handleTopLevelWhileStmt as handleWhileExternal } from "./whileHelpers";
import { finalizeInitializedDeclaration } from "./declarations";

interface Binding {
  value: number;
  suffix?: string;
  // track whether this binding has been assigned/initialized; once true, binding is immutable unless 'mutable' is set
  assigned?: boolean;
  mutable?: boolean;
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
  const r = interpret(subAll.value, env);
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

function parseDeclaration(
  stmt: string,
  env: Map<string, Binding>
): Result<void, string> {
  let p = 4;
  while (p < stmt.length && stmt[p] === " ") p++;

  // optional 'mut' keyword
  let isMutable = false;
  if (stmt.startsWith("mut", p)) {
    const post = p + 3;
    if (post >= stmt.length || stmt[post] === " ") {
      isMutable = true;
      p = post;
      while (p < stmt.length && stmt[p] === " ") p++;
    }
  }

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
    // uninitialized binding: assigned = false (first assignment allowed). store mutability
    env.set(ident, { value: 0, suffix, assigned: false, mutable: isMutable });
    return { ok: true, value: undefined };
  }

  const rhs = stmt.slice(eq + 1).trim();

  const init = resolveInitializer(rhs, env);
  if (!init.ok) return init as Err<string>;

  return finalizeInitializedDeclaration(
    stmt,
    ident,
    p,
    eq,
    rhs,
    init.value,
    env,
    isMutable
  );
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
  if (innerRes.ok)
    return {
      ok: true,
      value: { rest: rest || undefined, value: innerRes.value },
    };
  if (innerRes.error === "block has no final expression")
    return { ok: true, value: { rest: rest || undefined } };
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

function handleLetStatement(
  stmt: string,
  envLocal: Map<string, Binding>
): "handled" | undefined | Result<void, string> {
  if (!stmt.startsWith("let ")) return undefined;
  const r = parseDeclaration(stmt, envLocal);
  if (!r.ok) return r as Err<string>;
  return "handled";
}

function processStatement(
  origStmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | undefined {
  let stmt = origStmt;

  const letHandled = handleLetStatement(stmt, envLocal);
  if (letHandled === "handled") return "handled";
  if (letHandled && !(letHandled as Err<string>).ok)
    return letHandled as Err<string>;
  // handle leading braced prefixes and normalize statement
  const prefixRes = stripLeadingBracedPrefixes(stmt, envLocal, isLast);
  if (!prefixRes.ok) return prefixRes;
  if (prefixRes.value.handled) return "handled";
  if (prefixRes.value.value !== undefined && isLast)
    return { ok: true, value: prefixRes.value.value };
  if (prefixRes.value.stmt) stmt = prefixRes.value.stmt;

  const tStmt = stmt.trim();

  const ctrlHandled = handleTopLevelControl(
    tStmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (ctrlHandled) return ctrlHandled;
  // assignment
  const assignHandled = processAssignmentIfAnyStmt(
    stmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (assignHandled) return assignHandled;
  // identifier statement
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

  // expression statement (with top-level substitution)
  return handleExpressionOrSubstitution(stmt, envLocal, parentEnvLocal, isLast);
}

function handleTopLevelIfStmt(
  tStmt: string,
  envLocal: Map<string, Binding>,
  isLast: boolean
): Result<number, string> | "handled" | undefined {
  if (!tStmt.startsWith("if ") && !tStmt.startsWith("if(")) return undefined;
  const exprRes = interpret(tStmt, envLocal);
  if (!exprRes.ok) return exprRes as Err<string>;
  if (isLast) return exprRes;
  return "handled";
}

function handleTopLevelControl(
  tStmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | undefined {
  const ifHandled = handleTopLevelIfStmt(tStmt, envLocal, isLast);
  if (ifHandled) return ifHandled;

  const whileHandled = handleWhileExternal(tStmt, envLocal, parentEnvLocal, {
    interpretFn: interpret,
    substituteAllIdentsFn: substituteAllIdents,
    lookupBindingFn: lookupBinding,
    isIdentifierOnlyFn: isIdentifierOnly,
    processStatementFn: processStatement,
    evaluateBlockFn: evaluateBlock,
    findMatchingParenIndexFn: findMatchingParenIndex,
  });
  if (whileHandled) return whileHandled;
  return undefined;
}

function handleExpressionOrSubstitution(
  stmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | undefined {
  const subRes = substituteTopLevelIdents(stmt, envLocal, parentEnvLocal);
  if (!subRes.ok) return subRes as Err<string>;
  const exprRes = interpret(subRes.value, envLocal);
  if (!exprRes.ok) return exprRes;
  if (isLast) return exprRes;
  return "handled";
}

function evaluateBlock(
  inner: string,
  parentEnv?: Map<string, Binding>,
  localEnv?: Map<string, Binding>
): Result<number, string> {
  const stmts = splitStatements(inner);
  const env = localEnv || new Map<string, Binding>();
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

  // detect compound assignment operator (e.g., '+=' , '-=', '*=', '/=')
  let opChar: string | undefined;
  let lhs = stmt.slice(0, eqPos).trim();
  if (eqPos > 0) {
    const maybeOp = stmt[eqPos - 1];
    if (
      maybeOp === "+" ||
      maybeOp === "-" ||
      maybeOp === "*" ||
      maybeOp === "/"
    ) {
      opChar = maybeOp;
      lhs = stmt.slice(0, eqPos - 1).trim();
    }
  }

  if (!isIdentifierOnly(lhs))
    return { ok: false, error: "invalid assignment LHS" };
  const name = lhs.split(" ")[0];
  const rhs = stmt.slice(eqPos + 1).trim();
  const init = resolveInitializer(rhs, env);
  if (!init.ok) return init as Err<string>;
  const targetEnv = findBindingEnv(name, env, parentEnv);
  if (!targetEnv) return { ok: false, error: `unknown identifier ${name}` };
  const existing = targetEnv.get(name)!;
  // if this binding was already assigned/initialized and is not mutable, it's immutable
  if (existing.assigned && !existing.mutable)
    return { ok: false, error: "assignment to immutable binding" };

  // delegate to helpers for clarity and to keep complexity low
  if (opChar) {
    const res = applyCompoundAssignment(
      existing as BindingLike,
      { value: init.value.value, suffix: init.value.suffix } as BindingLike,
      opChar
    );
    return res;
  }

  const res = applyPlainAssignment(
    existing as BindingLike,
    { value: init.value.value, suffix: init.value.suffix } as BindingLike
  );
  return res;
}

export function interpret(
  input: string,
  parentEnv?: Map<string, Binding>
): Result<number, string> {
  const s = input.trim();

  if (s === "true") return { ok: true, value: 1 };
  if (s === "false") return { ok: true, value: 0 };

  if (isIdentifierOnly(s)) {
    if (parentEnv) {
      const name = s.split(" ")[0];
      const b = lookupBinding(name, parentEnv);
      if (!b.ok) return b as Err<string>;
      return { ok: true, value: b.value.value };
    }
    return { ok: true, value: 0 };
  }
  if (findTopLevelChar(s, 0, ";") !== -1 || s.startsWith("let "))
    return evaluateBlock(s);

  if (needsArithmetic(s)) return handleAddSubChain(s, parentEnv);

  return handleSingle(s);
}

function needsArithmetic(s: string): boolean {
  return (
    s.indexOf("+") !== -1 ||
    s.indexOf("-") !== -1 ||
    s.indexOf("*") !== -1 ||
    s.indexOf("/") !== -1 ||
    s.indexOf("<") !== -1 ||
    s.indexOf(">") !== -1 ||
    s.indexOf("==") !== -1 ||
    s.indexOf("!=") !== -1 ||
    s.indexOf("&&") !== -1 ||
    s.indexOf("||") !== -1 ||
    s.startsWith("if ") ||
    s.startsWith("if(")
  );
}

setInterpreterFns(interpret, evaluateBlock);
