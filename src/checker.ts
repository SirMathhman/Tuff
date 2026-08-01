import type { ASTNode } from "./ast";
import { isExpression } from "./ast";
import type { Result } from "./result";
import { ok, err } from "./result";
import type { Scope } from "./scope";
import type { CompileError } from "./compileError";
import { compileError } from "./compileError";
import {
  inferType,
  typeMismatch,
  rangeError,
  isKnownType,
  typeMatches,
  setNodeType,
} from "./types";

function scopeError(message: string): CompileError {
  return compileError("scope", message);
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
): Result<void, CompileError> {
  function checkNode(
    node: ASTNode,
    ctx: CheckContext,
  ): Result<void, CompileError> {
    switch (node.kind) {
      case "number": {
        // Validate that a typed literal fits its type's range.
        const rangeErr = rangeError(node.value, node.suffix);
        if (rangeErr !== undefined) {
          return err(compileError("syntax", rangeErr));
        }
        setNodeType(node, node.suffix ?? "Int");
        return ok(undefined);
      }

      case "boolean":
        // Always valid
        setNodeType(node, "Bool");
        return ok(undefined);

      case "identifier":
        if (!ctx.scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        setNodeType(node, ctx.scope.typeOf(node.name) ?? "Int");
        return ok(undefined);

      case "member_access":
        // Only validate the object (the base identifier), property access is always valid
        return checkNode(node.object, ctx.asValue());

      case "binary_op": {
        const leftResult = checkNode(node.left, ctx.asValue());
        if (!leftResult.ok) return leftResult;
        const rightResult = checkNode(node.right, ctx.asValue());
        if (!rightResult.ok) return rightResult;
        // A binary op's type is the type of its operands (they must agree).
        setNodeType(
          node,
          inferType(node.left) ?? inferType(node.right) ?? "Int",
        );
        return ok(undefined);
      }

      case "is": {
        // Validate the value expression, and that the type name is known.
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        if (!isKnownType(node.typeName)) {
          return err(
            compileError("syntax", "Unknown type: '" + node.typeName + "'"),
          );
        }
        // Compute the compile-time result: whether the value's inferred type
        // matches the checked type (type identity, not assignability).
        const valueType = inferType(node.value);
        node.result =
          valueType !== undefined && typeMatches(valueType, node.typeName);
        setNodeType(node, "Bool");
        return ok(undefined);
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
          return err(
            compileError("syntax", "If expression must have an else branch"),
          );
        }
        if (node.elseBranch !== undefined) {
          const elseResult = checkNode(node.elseBranch, ctx);
          if (!elseResult.ok) return elseResult;
          setNodeType(
            node,
            inferType(node.thenBranch) ?? inferType(node.elseBranch) ?? "Int",
          );
        } else {
          setNodeType(node, inferType(node.thenBranch) ?? "Int");
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
              return err(
                compileError("syntax", "Block must end with an expression"),
              );
            }
            return err(scopeError("Block must end with an expression"));
          }
        }
        // A block's type is the type of its last statement (its yielded value).
        const last = node.statements[node.statements.length - 1];
        if (last !== undefined) {
          const lastType = inferType(last);
          if (lastType !== undefined) {
            setNodeType(node, lastType);
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
        // If a type annotation is present, it must name a known type, and the
        // value's type must be assignable to it (widening allowed, narrowing
        // rejected, different kinds rejected).
        if (node.typeAnnotation !== undefined) {
          if (!isKnownType(node.typeAnnotation)) {
            return err(
              compileError(
                "syntax",
                "Unknown type: '" + node.typeAnnotation + "'",
              ),
            );
          }
          const valueType = inferType(node.value);
          if (valueType !== undefined) {
            const mismatch = typeMismatch(node.typeAnnotation, valueType);
            if (mismatch !== undefined) {
              return err(compileError("syntax", mismatch));
            }
          }
        }
        // Then add the new variable to scope, recording its type (either the
        // annotation, or the inferred type of the value).
        const declaredType =
          node.typeAnnotation ?? inferType(node.value) ?? "Int";
        ctx.scope.declare(node.name, node.isMut === true, declaredType);
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
