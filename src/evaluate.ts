import type {
  AstNode,
  BinaryOp,
  Scope,
  EvalResult,
  EvalSignal,
  MatchPattern,
  Result,
} from "./types";

import { BINARY_OPS } from "./types";

import { getProducesValue, lookupScopeEntry, findScopeFrame } from "./analyze";

import { parseProgram } from "./parse";

import { tokenize } from "./tokenize";

function evalBinaryOp(node: BinaryOp, scope: Scope): EvalResult {
  const leftResult = evalAst(node.left, scope);
  const rightResult = evalAst(node.right, scope);

  const leftCheck = getProducesValue(
    leftResult,
    "Binary operation left operand",
  );
  if (!leftCheck.ok) return leftCheck.error;
  const rightCheck = getProducesValue(
    rightResult,
    "Binary operation right operand",
  );
  if (!rightCheck.ok) return rightCheck.error;

  const value = BINARY_OPS[node.op].eval(
    leftCheck.value.value,
    rightCheck.value.value,
  );
  return { type: "value", value };
}

function matchPattern(
  pattern: MatchPattern,
  value: number,
  _scope: Scope,
): boolean {
  switch (pattern.type) {
    case "wildcard":
      return true;
    case "number":
      return pattern.value === value;
    case "identifier":
      _scope.locals.set(pattern.name, { value, mutable: false });
      return true;
  }
}

function evalBlockStatements(statements: AstNode[], scope: Scope): EvalResult {
  const childScope: Scope = { locals: new Map(), parent: scope };
  let lastValue = 0;
  let hasValue = false;
  for (const stmt of statements) {
    const result = evalAst(stmt, childScope);
    if (result.type === "signal" || result.type === "error") {
      return result;
    }
    if (result.type === "value") {
      lastValue = result.value;
      hasValue = true;
    }
  }
  if (!hasValue) {
    return { type: "void" };
  }
  return { type: "value", value: lastValue };
}

function evalAst(node: AstNode, scope: Scope): EvalResult {
  switch (node.type) {
    case "block":
      return evalBlockStatements(node.statements, scope);
    case "number":
      return { type: "value", value: node.value };
    case "bool":
      return { type: "value", value: node.value ? 1 : 0 };
    case "identifier": {
      const entryResult = lookupScopeEntry(node.name, scope);
      if (!entryResult.ok) return entryResult.error;
      return { type: "value", value: entryResult.value.value };
    }
    case "binary_op":
      return evalBinaryOp(node, scope);
    case "let": {
      const initCheck = getProducesValue(evalAst(node.init, scope), "Let init");
      if (!initCheck.ok) return initCheck.error;
      scope.locals.set(node.name, {
        value: initCheck.value.value,
        mutable: node.mutable,
      });
      return { type: "void" };
    }
    case "assign_expr": {
      const frameResult = findScopeFrame(node.name, scope);
      if (!frameResult.ok) return frameResult.error;
      const entry = frameResult.value.locals.get(node.name)!;
      if (!entry.mutable) {
        return {
          type: "error",
          message: `Cannot assign to immutable variable '${node.name}'`,
        };
      }
      const rhsCheck = getProducesValue(
        evalAst(node.value, scope),
        "Assignment right-hand side",
      );
      if (!rhsCheck.ok) return rhsCheck.error;
      entry.value = rhsCheck.value.value;
      return { type: "void" };
    }
    case "if_expr": {
      const condCheck = getProducesValue(
        evalAst(node.condition, scope),
        "Condition",
      );
      if (!condCheck.ok) return condCheck.error;
      if (condCheck.value.value !== 0) {
        return evalAst(node.then, scope);
      }
      if (node.else_ !== null) {
        return evalAst(node.else_, scope);
      }
      return { type: "void" };
    }
    case "while_expr": {
      while (true) {
        const condCheck = getProducesValue(
          evalAst(node.condition, scope),
          "While condition",
        );
        if (!condCheck.ok) return condCheck.error;
        if (condCheck.value.value === 0) break;
        const bodyResult = evalAst(node.body, scope);
        if (bodyResult.type === "error") return bodyResult;
        if (bodyResult.type === "signal" && bodyResult.signal === "continue") {
          continue;
        }
        if (bodyResult.type === "signal" && bodyResult.signal === "break") {
          break;
        }
      }
      return { type: "void" };
    }
    case "continue":
      return { type: "signal", signal: "continue" } as EvalSignal;
    case "break":
      return { type: "signal", signal: "break" } as EvalSignal;
    case "match_expr": {
      const scrutineeCheck = getProducesValue(
        evalAst(node.scrutinee, scope),
        "Match scrutinee",
      );
      if (!scrutineeCheck.ok) return scrutineeCheck.error;
      for (const arm of node.arms) {
        const armScope: Scope = { locals: new Map(), parent: scope };
        const matched = matchPattern(
          arm.pattern,
          scrutineeCheck.value.value,
          armScope,
        );
        if (matched) {
          return evalAst(arm.body, armScope);
        }
      }
      return { type: "error", message: "Non-exhaustive match patterns" };
    }
  }
}

// --- Entry Point ---
export function evaluate(source: string): Result<number, string> {
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: true, value: 0 };

  const tokenResult = tokenize(trimmed);
  if (!tokenResult.ok) return { ok: false, error: tokenResult.error.message };
  if (tokenResult.value.length === 0) return { ok: true, value: 0 };

  const parseResult = parseProgram(tokenResult.value, 0);
  if (!parseResult.ok) return { ok: false, error: parseResult.error.message };

  const scope: Scope = { locals: new Map(), parent: null };
  const result = evalAst(parseResult.value.ast, scope);
  if (result.type === "error") return { ok: false, error: result.message };
  return { ok: true, value: result.type === "value" ? result.value : 0 };
}
