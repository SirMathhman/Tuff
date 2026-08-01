import type { ASTNode } from "./ast";
import type { Result } from "./result";
import { ok, err } from "./result";
import type { Scope } from "./scope";

function scopeError(message: string): Error {
  const err = new Error(message);
  err.name = "ScopeError";
  return err;
}

export function validateScope(
  stmts: ASTNode[],
  initialScope: Scope,
): Result<void, Error> {
  function checkNode(node: ASTNode, scope: Scope): Result<void, Error> {
    switch (node.kind) {
      case "number":
        // Always valid
        return ok(undefined);

      case "boolean":
        // Always valid
        return ok(undefined);

      case "identifier":
        if (!scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        return ok(undefined);

      case "member_access":
        // Only validate the object (the base identifier), property access is always valid
        return checkNode(node.object, scope);

      case "binary_op": {
        const leftResult = checkNode(node.left, scope);
        if (!leftResult.ok) return leftResult;
        return checkNode(node.right, scope);
      }

      case "if": {
        const conditionResult = checkNode(node.condition, scope);
        if (!conditionResult.ok) return conditionResult;
        const thenResult = checkNode(node.thenBranch, scope);
        if (!thenResult.ok) return thenResult;
        return checkNode(node.elseBranch, scope);
      }

      case "block": {
        // A block introduces a child scope that inherits from the parent
        const child = scope.child();
        for (const stmt of node.statements) {
          const result = checkNode(stmt, child);
          if (!result.ok) return result;
        }
        return ok(undefined);
      }

      case "assign": {
        if (!scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        if (!scope.isMutable(node.name)) {
          return err(
            scopeError(
              "Cannot assign to immutable variable: '" + node.name + "'",
            ),
          );
        }
        return checkNode(node.value, scope);
      }

      case "let_decl": {
        // Validate the value expression first (RHS)
        const valueResult = checkNode(node.value, scope);
        if (!valueResult.ok) return valueResult;
        // Then add the new variable to scope
        scope.declare(node.name, node.isMut === true);
        return ok(undefined);
      }
    }
  }

  for (const stmt of stmts) {
    const result = checkNode(stmt, initialScope);
    if (!result.ok) return result;
  }

  return ok(undefined);
}
