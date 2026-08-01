import type { ASTNode } from "./ast";
import { isExpression } from "./ast";
import type { Result } from "./result";
import { ok, err } from "./result";
import type { Scope } from "./scope";

function scopeError(message: string): Error {
  const err = new Error(message);
  err.name = "ScopeError";
  return err;
}

// CheckContext encapsulates the state threaded through semantic checking:
// the current scope and whether the node's value is being used (as opposed
// to being evaluated as a standalone statement). A block used as a value
// must end in a pure expression; a block used as a statement may not.
interface CheckContext {
  scope: Scope;
  valueContext: boolean;
  // Return a context that evaluates the node as a value.
  asValue(): CheckContext;
  // Return a context with a child scope (for blocks).
  inChildScope(): CheckContext;
}

function createContext(scope: Scope, valueContext: boolean): CheckContext {
  return {
    scope,
    valueContext,
    asValue() {
      return createContext(scope, true);
    },
    inChildScope() {
      return createContext(scope.child(), valueContext);
    },
  };
}

export function validateScope(
  stmts: ASTNode[],
  initialScope: Scope,
): Result<void, Error> {
  function checkNode(node: ASTNode, ctx: CheckContext): Result<void, Error> {
    switch (node.kind) {
      case "number":
        // Always valid
        return ok(undefined);

      case "boolean":
        // Always valid
        return ok(undefined);

      case "identifier":
        if (!ctx.scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        return ok(undefined);

      case "member_access":
        // Only validate the object (the base identifier), property access is always valid
        return checkNode(node.object, ctx.asValue());

      case "binary_op": {
        const leftResult = checkNode(node.left, ctx.asValue());
        if (!leftResult.ok) return leftResult;
        return checkNode(node.right, ctx.asValue());
      }

      case "if": {
        const conditionResult = checkNode(node.condition, ctx.asValue());
        if (!conditionResult.ok) return conditionResult;
        // The branches are checked in the same context as the `if` itself:
        // when the `if` is used as a value, its branches must yield values;
        // when used as a statement, its branches may be statement blocks.
        const thenResult = checkNode(node.thenBranch, ctx);
        if (!thenResult.ok) return thenResult;
        // An `if` used as a value must have an else branch, since a value
        // must always be produced.
        if (ctx.valueContext && node.elseBranch === undefined) {
          return err(new Error("If expression must have an else branch"));
        }
        if (node.elseBranch !== undefined) {
          return checkNode(node.elseBranch, ctx);
        }
        return ok(undefined);
      }

      case "while": {
        // The condition is always a value; the body is a statement.
        const conditionResult = checkNode(node.condition, ctx.asValue());
        if (!conditionResult.ok) return conditionResult;
        return checkNode(node.body, ctx);
      }

      case "block": {
        // A block introduces a child scope that inherits from the parent
        const childCtx = ctx.inChildScope();
        for (const stmt of node.statements) {
          const result = checkNode(stmt, childCtx);
          if (!result.ok) return result;
        }
        // A block used as a value yields its last statement's value, so it
        // must end in a pure expression. A declaration is a semantic error;
        // an assignment is a syntax error (it's a statement, not a value).
        if (ctx.valueContext) {
          const last = node.statements[node.statements.length - 1];
          if (last !== undefined && !isExpression(last)) {
            if (last.kind === "assign") {
              return err(new Error("Block must end with an expression"));
            }
            return err(scopeError("Block must end with an expression"));
          }
        }
        return ok(undefined);
      }

      case "assign": {
        if (!ctx.scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        if (!ctx.scope.isMutable(node.name)) {
          return err(
            scopeError(
              "Cannot assign to immutable variable: '" + node.name + "'",
            ),
          );
        }
        return checkNode(node.value, ctx.asValue());
      }

      case "let_decl": {
        // Validate the value expression first (RHS)
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // Then add the new variable to scope
        ctx.scope.declare(node.name, node.isMut === true);
        return ok(undefined);
      }
    }
  }

  for (const stmt of stmts) {
    const result = checkNode(stmt, createContext(initialScope, false));
    if (!result.ok) return result;
  }

  return ok(undefined);
}
