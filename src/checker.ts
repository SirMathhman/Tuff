import type { ASTNode } from "./ast";
import type { Result } from "./result";
import { ok, err } from "./result";

function scopeError(message: string): Error {
  const err = new Error(message);
  err.name = "ScopeError";
  return err;
}

export function validateScope(
  stmts: ASTNode[],
  initialScope: Set<string>,
): Result<void, Error> {
  const scope = new Set(initialScope);
  // Track which variables are mutable
  const mutable = new Set<string>();

  function checkNode(node: ASTNode): Result<void, Error> {
    switch (node.kind) {
      case "number":
        // Always valid
        return ok(undefined);

      case "boolean":
        // Always valid
        return ok(undefined);

      case "identifier":
        if (!scope.has(node.name)) {
          return err(scopeError(`Undeclared identifier: '${node.name}'`));
        }
        return ok(undefined);

      case "member_access":
        // Only validate the object (the base identifier), property access is always valid
        return checkNode(node.object);

      case "binary_op": {
        const leftResult = checkNode(node.left);
        if (!leftResult.ok) return leftResult;
        return checkNode(node.right);
      }

      case "if": {
        const conditionResult = checkNode(node.condition);
        if (!conditionResult.ok) return conditionResult;
        const thenResult = checkNode(node.thenBranch);
        if (!thenResult.ok) return thenResult;
        return checkNode(node.elseBranch);
      }

      case "assign": {
        if (!scope.has(node.name)) {
          return err(scopeError(`Undeclared identifier: '${node.name}'`));
        }
        if (!mutable.has(node.name)) {
          return err(
            scopeError(`Cannot assign to immutable variable: '${node.name}'`),
          );
        }
        return checkNode(node.value);
      }

      case "let_decl": {
        // Validate the value expression first (RHS)
        const valueResult = checkNode(node.value);
        if (!valueResult.ok) return valueResult;
        // Then add the new variable to scope
        scope.add(node.name);
        if (node.isMut) {
          mutable.add(node.name);
        }
        return ok(undefined);
      }
    }
  }

  for (const stmt of stmts) {
    const result = checkNode(stmt);
    if (!result.ok) return result;
  }

  return ok(undefined);
}
