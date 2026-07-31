import type {
  AstNode,
  Scope,
  ScopeFrame,
  ScopeEntry,
  EvalResult,
  EvalValue,
  Result,
  EvalError,
} from "./types";

// Static analysis: does the AST node produce a value when evaluated?
export function producesValue(node: AstNode): boolean {
  switch (node.type) {
    case "number":
    case "bool":
    case "identifier":
    case "binary_op":
      return true;
    case "block":
      return (
        node.statements.length > 0 &&
        producesValue(node.statements[node.statements.length - 1]!)
      );
    case "if_expr":
      if (node.else_ === null) return false;
      return producesValue(node.then) && producesValue(node.else_);
    case "match_expr":
      return true;
    case "let":
    case "assign_expr":
    case "while_expr":
      return false;
    case "continue":
    case "break":
      return false;
  }
}

// Runtime check: returns the EvalValue in Ok, or an EvalError in Err
export function getProducesValue(
  result: EvalResult,
  context: string,
): Result<EvalValue, EvalError> {
  if (result.type !== "value") {
    return {
      ok: false,
      error: { type: "error", message: `${context} must produce a value` },
    };
  }
  return { ok: true, value: result };
}

// Scope chain lookup: finds the frame containing the variable
export function findScopeFrame(
  name: string,
  scope: Scope,
): Result<ScopeFrame, EvalError> {
  let frame: ScopeFrame | null = scope;
  while (frame) {
    if (frame.locals.has(name)) return { ok: true, value: frame };
    frame = frame.parent;
  }
  return {
    ok: false,
    error: { type: "error", message: `Undefined variable '${name}'` },
  };
}

// Scope chain lookup: returns the entry for a variable
export function lookupScopeEntry(
  name: string,
  scope: Scope,
): Result<ScopeEntry, EvalError> {
  const frameResult = findScopeFrame(name, scope);
  if (!frameResult.ok) return frameResult;
  return { ok: true, value: frameResult.value.locals.get(name)! };
}
