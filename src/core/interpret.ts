import type { Result, Err } from "../helpers/result";
import { splitStatements, findTopLevelChar } from "../parsers/interpretHelpers";

import { handleAddSubChain, handleSingle, setInterpreterFns } from "../arith/arith";
import {
  substituteAllIdents,
  substituteTopLevelIdents,
  isIdentifierOnly,
  findMatchingParenIndex,
} from "../parsers/interpretHelpers";

import { lookupBinding, findBindingEnv } from "../control/ifValidators";
import { findTopLevelElseInString } from "../control/ifHelpers";
import { handleStatementElseIfChainGeneric } from "../control/ifRunner";
import { needsArithmetic } from "../helpers/exprNeeds";
import { parseDeclaration, resolveInitializer } from "../parsers/declarationHelpers";

import {
  applyCompoundAssignment,
  applyPlainAssignment,
  type BindingLike,
} from "../helpers/assignHelpers";
import { handleTopLevelWhileStmt as handleWhileExternal } from "../control/whileHelpers";
import { parseFnDeclStatement, type ParamDecl } from "../parsers/fnDeclHelpers";
import {
  interpretSpecialLiterals,
  startsWithIdentCall,
} from "./interpretEntryHelpers";

interface FnDescriptor {
  params: ParamDecl[];
  body: string;
  closure?: Map<string, Binding>;
}

interface Binding {
  value: number;
  suffix?: string;
  // track whether this binding has been assigned/initialized; once true, binding is immutable unless 'mutable' is set
  assigned?: boolean;
  mutable?: boolean;
  // optional function descriptor for declared functions
  fn?: FnDescriptor;
}

function handleFnStatement(
  stmt: string,
  envLocal: Map<string, Binding>
): "handled" | undefined | Result<void, string> {
  const parsed = parseFnDeclStatement(stmt);
  if (!parsed) return undefined;
  if (!parsed.ok) return parsed as Err<string>;
  const { name, params, body } = parsed.value;

  if (envLocal.has(name)) return { ok: false, error: "duplicate declaration" };

  const binding: Binding = {
    value: 0,
    assigned: true,
    fn: { params, body, closure: envLocal },
  };

  envLocal.set(name, binding);
  return "handled";
}

interface EnvWithParent {
  __parent?: Map<string, Binding>;
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
  const r = parseDeclaration(stmt, envLocal, evaluateBlock);
  if (!r.ok) return r as Err<string>;
  return "handled";
}

function handleBreakContinueStatement(
  trimmed: string
): "break" | "continue" | undefined {
  if (trimmed === "break") return "break";
  if (trimmed === "continue") return "continue";
  return undefined;
}

function handleDeclarations(
  stmt: string,
  envLocal: Map<string, Binding>
): "handled" | undefined | Result<void, string> {
  const letHandled = handleLetStatement(stmt, envLocal);
  if (letHandled) return letHandled;
  return handleFnStatement(stmt, envLocal);
}

function processNormalizedStatement(
  stmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal: Map<string, Binding> | undefined,
  isLast: boolean
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  const tStmt = stmt.trim();

  const ctrlHandled = handleTopLevelControl(
    tStmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (ctrlHandled) return ctrlHandled;

  const assignHandled = processAssignmentIfAnyStmt(
    stmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (assignHandled) return assignHandled;

  const identHandled = handleIdentifierStmt(
    stmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
  if (identHandled) return identHandled === true ? "handled" : identHandled;

  return handleExpressionOrSubstitution(stmt, envLocal, parentEnvLocal, isLast);
}

function processStatement(
  origStmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  let stmt = origStmt;
  const flow = handleBreakContinueStatement(stmt.trim());
  if (flow) return flow;

  const declHandled = handleDeclarations(stmt, envLocal);
  if (declHandled === "handled") return "handled";
  if (declHandled && !(declHandled as Err<string>).ok)
    return declHandled as Err<string>;

  // handle leading braced prefixes and normalize statement
  const prefixRes = stripLeadingBracedPrefixes(stmt, envLocal, isLast);
  if (!prefixRes.ok) return prefixRes;
  if (prefixRes.value.handled) return "handled";
  if (prefixRes.value.value !== undefined && isLast)
    return { ok: true, value: prefixRes.value.value };
  if (prefixRes.value.stmt) stmt = prefixRes.value.stmt;

  return processNormalizedStatement(stmt, envLocal, parentEnvLocal, isLast);
}

function handleStatementIf(
  tStmt: string,
  k: number,
  envLocal: Map<string, Binding>,
  parentEnvLocal: Map<string, Binding> | undefined
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  const body = tStmt.slice(k + 1).trim();
  if (body.length === 0) return undefined;

  // evaluate condition
  const condText = tStmt.slice(tStmt.indexOf("(") + 1, k).trim();
  const condSub = substituteAllIdents(condText, envLocal, parentEnvLocal);
  if (!condSub.ok) return condSub as Err<string>;
  const condRes = interpret(condSub.value, envLocal);
  if (!condRes.ok) return condRes as Err<string>;
  if (condRes.value === 0) return "handled";

  // condition true => execute then-branch as a statement
  if (body.startsWith("{")) {
    const braceEnd = findTopLevelChar(body, 0, "}");
    if (braceEnd === -1)
      return { ok: false, error: "unmatched brace in if body" };
    const inner = body.slice(1, braceEnd);
    const r = evaluateBlock(inner, undefined, envLocal);
    if (!r.ok) {
      if (r.error === "break") return "break";
      if (r.error === "continue") return "continue";
      return r as Err<string>;
    }
    return "handled";
  }

  // single-statement then-branch up to semicolon or end
  const endPos = findTopLevelChar(tStmt, k + 1, ";");
  const thenStmt =
    endPos === -1
      ? tStmt.slice(k + 1).trim()
      : tStmt.slice(k + 1, endPos).trim();

  const psRes = processStatement(thenStmt, envLocal, parentEnvLocal, false);
  if (psRes === "handled") return "handled";
  if (psRes === "break") return "break";
  if (psRes === "continue") return "continue";
  if (psRes) return psRes;

  return "handled";
}

function handleTopLevelIfStmt(
  tStmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal: Map<string, Binding> | undefined,
  isLast: boolean
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  if (!tStmt.startsWith("if ") && !tStmt.startsWith("if(")) return undefined;

  const i = tStmt.indexOf("(");
  if (i === -1) return undefined;
  const k = findMatchingParenIndex(tStmt, i);
  if (k === -1) return undefined;

  // check for top-level 'else' to decide between expression-if and statement-if
  const elsePos = findTopLevelElseInString(tStmt, k + 1);
  if (elsePos !== -1) {
    return handleStatementElseIfChainGeneric(
      tStmt,
      envLocal,
      parentEnvLocal,
      isLast,
      interpret,
      substituteAllIdents,
      findMatchingParenIndex,
      findTopLevelElseInString,
      evaluateBlock,
      processStatement
    );
  }

  return handleStatementIf(tStmt, k, envLocal, parentEnvLocal);
}

function handleTopLevelControl(
  tStmt: string,
  envLocal: Map<string, Binding>,
  parentEnvLocal?: Map<string, Binding>,
  isLast = false
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  const ifHandled = handleTopLevelIfStmt(
    tStmt,
    envLocal,
    parentEnvLocal,
    isLast
  );
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
  // attach parent pointer so nested blocks can traverse outer environments
  // If a local env was provided, it may already contain a parent pointer (closure);
  // don't overwrite it. Only set when creating a new env or when parent is missing.
  if (!(env as unknown as EnvWithParent).__parent) {
    (env as unknown as EnvWithParent).__parent = parentEnv;
  }
  // debug trace

  for (let i = 0; i < stmts.length; i++) {
    let stmt = stmts[i];
    if (stmt.length === 0) continue;

    // Merge following 'else' clauses into a preceding 'if' so that chains like
    // "if (...) a = 1; else if (...) a = 2; else a = 3" are evaluated as one
    // logical statement rather than multiple separate statements (which would
    // otherwise cause spurious "invalid assignment LHS" errors when 'else'
    // fragments are treated alone).
    const tStmt = stmt.trim();
    if (tStmt.startsWith("if ") || tStmt.startsWith("if(")) {
      let j = i + 1;
      while (j < stmts.length && stmts[j].trim().startsWith("else")) {
        stmt = stmt + "; " + stmts[j];
        j++;
      }
      // advance index to skip merged parts
      i = j - 1;
    }

    const res = processStatement(stmt, env, parentEnv, i === stmts.length - 1);
    if (res === "handled") continue;
    if (res === "break") return { ok: false, error: "break" };
    if (res === "continue") return { ok: false, error: "continue" };
    if (res) return res;
  }
  // no final expression found
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
  const init = resolveInitializer(rhs, env, evaluateBlock);
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

  const lit = interpretSpecialLiterals(s);
  if (lit) return lit;

  if (startsWithIdentCall(s)) return handleAddSubChain(s, parentEnv);

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
    return evaluateBlock(s, parentEnv);

  if (needsArithmetic(s)) return handleAddSubChain(s, parentEnv);

  return handleSingle(s);
}

setInterpreterFns(interpret, evaluateBlock);
