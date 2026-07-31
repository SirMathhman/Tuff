import type {
  AstNode,
  BinaryOp,
  Scope,
  ScopeFrame,
  ScopeEntry,
  EvalResult,
  EvalValue,
} from "./types";

import { BINARY_OPS } from "./types";

import { parseProgram } from "./parse";

import { tokenize } from "./tokenize";

function findScopeFrame(name: string, scope: Scope): ScopeFrame {
  let frame: ScopeFrame | null = scope;
  while (frame) {
    if (frame.locals.has(name)) return frame;
    frame = frame.parent;
  }
  throw new Error(`Undefined variable '${name}'`);
}

function lookupScopeEntry(name: string, scope: Scope): ScopeEntry {
  return findScopeFrame(name, scope).locals.get(name)!;
}

function evalBinaryOp(node: BinaryOp, scope: Scope): EvalValue {
  const leftResult = evalAst(node.left, scope);
  const rightResult = evalAst(node.right, scope);

  // Both operands must be values for binary operations
  if (leftResult.type !== "value" || rightResult.type !== "value") {
    throw new Error(
      `Binary operation requires value expressions on both sides`,
    );
  }

  const value = BINARY_OPS[node.op].eval(leftResult.value, rightResult.value);
  return { type: "value", value };
}

function evalBlockStatements(statements: AstNode[], scope: Scope): EvalResult {
  // Create a new child scope frame for block scoping
  const childScope: Scope = { locals: new Map(), parent: scope };
  let lastValue = 0;
  let hasValue = false;
  for (const stmt of statements) {
    const result = evalAst(stmt, childScope);
    if (result.type === "value") {
      lastValue = result.value;
      hasValue = true;
    }
  }
  // Child scope is discarded on exit — no cleanup needed
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
      const entry = lookupScopeEntry(node.name, scope);
      return { type: "value", value: entry.value };
    }
    case "binary_op":
      return evalBinaryOp(node, scope);
    case "let": {
      const initResult = evalAst(node.init, scope);
      if (initResult.type !== "value") {
        throw new Error(`Let init must evaluate to a value`);
      }
      // Allow shadowing — redeclaration is permitted
      scope.locals.set(node.name, {
        value: initResult.value,
        mutable: node.mutable,
      });
      return { type: "void" }; // declarations don't produce values
    }
    case "assign_expr": {
      const frame = findScopeFrame(node.name, scope);
      const entry = frame.locals.get(node.name)!;
      if (!entry.mutable) {
        throw new Error(`Cannot assign to immutable variable '${node.name}'`);
      }
      const valueResult = evalAst(node.value, scope);
      if (valueResult.type !== "value") {
        throw new Error(`Assignment requires a value expression`);
      }
      entry.value = valueResult.value;
      return { type: "void" }; // assignments don't produce values
    }
    case "if_expr": {
      const condResult = evalAst(node.condition, scope);
      if (condResult.type !== "value") {
        throw new Error(`Condition must produce a value`);
      }
      if (condResult.value !== 0) {
        return evalAst(node.then, scope);
      }
      if (node.else_ !== null) {
        return evalAst(node.else_, scope);
      }
      return { type: "void" };
    }
  }
}

// --- Entry Point ---
export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed.length === 0) return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  const parsed = parseProgram(tokens, 0); // returns block AST with all statements
  const scope: Scope = { locals: new Map(), parent: null };
  const result = evalAst(parsed.ast, scope);
  return result.type === "value" ? result.value : 0;
}
