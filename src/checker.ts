import type { ASTNode, FnSignature } from "./ast";
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
// the current scope, the function table, and whether the node's value is
// being used (as opposed to being evaluated as a standalone statement). A
// block used as a value must end in a pure expression; a block used as a
// statement may not.
interface CheckContext {
  scope: Scope;
  // The single source of truth for declared functions: name -> signature.
  functions: Map<string, FnSignature>;
  valueContext: boolean;
  // Return a context that evaluates the node as a value.
  asValue(): CheckContext;
  // Return a context with a child scope (for blocks).
  inChildScope(): CheckContext;
}

function createContext(
  scope: Scope,
  functions: Map<string, FnSignature>,
  valueContext: boolean,
): CheckContext {
  return {
    scope,
    functions,
    valueContext,
    asValue() {
      return createContext(scope, functions, true);
    },
    inChildScope() {
      return createContext(scope.child(), functions, valueContext);
    },
  };
}

export function validateScope(
  stmts: ASTNode[],
  initialScope: Scope,
): Result<void, CompileError> {
  // The single source of truth for declared functions: name -> signature.
  const functions = new Map<string, FnSignature>();

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

      case "fn_decl": {
        // A function name must not collide with an existing variable or
        // function in the current scope.
        if (ctx.functions.has(node.name) || ctx.scope.isDeclared(node.name)) {
          return err(
            scopeError(
              "Name collision: '" + node.name + "' is already declared",
            ),
          );
        }
        // The return type must be a known type.
        if (!isKnownType(node.returnType)) {
          return err(
            compileError("syntax", "Unknown type: '" + node.returnType + "'"),
          );
        }
        // Each parameter type must be a known type.
        for (const param of node.params) {
          if (!isKnownType(param.type)) {
            return err(
              compileError("syntax", "Unknown type: '" + param.type + "'"),
            );
          }
        }
        // Record the function's signature so calls can validate arguments.
        ctx.functions.set(node.name, {
          params: node.params,
          returnType: node.returnType,
        });
        // Check the body in a child scope where the parameters are declared
        // (immutable, with their declared types).
        const fnCtx = ctx.inChildScope();
        for (const param of node.params) {
          fnCtx.scope.declare(param.name, false, param.type);
        }
        const bodyResult = checkNode(node.body, fnCtx.asValue());
        if (!bodyResult.ok) return bodyResult;
        // The body's type must be assignable to the declared return type.
        const bodyType = inferType(node.body);
        if (bodyType !== undefined) {
          const mismatch = typeMismatch(node.returnType, bodyType);
          if (mismatch !== undefined) {
            return err(compileError("syntax", mismatch));
          }
        }
        return ok(undefined);
      }

      case "call": {
        // The called function must be declared.
        const sig = ctx.functions.get(node.name);
        if (sig === undefined) {
          return err(scopeError("Undeclared function: '" + node.name + "'"));
        }
        // Check each argument expression.
        for (const arg of node.args) {
          const argResult = checkNode(arg, ctx.asValue());
          if (!argResult.ok) return argResult;
        }
        // Validate the argument count and each argument's type against the
        // function's declared parameters.
        if (node.args.length !== sig.params.length) {
          return err(
            scopeError(
              "Function '" +
                node.name +
                "' expects " +
                sig.params.length +
                " arguments, got " +
                node.args.length,
            ),
          );
        }
        for (let i = 0; i < node.args.length; i++) {
          const arg = node.args[i]!;
          const param = sig.params[i]!;
          const argType = inferType(arg);
          if (argType !== undefined) {
            const mismatch = typeMismatch(param.type, argType);
            if (mismatch !== undefined) {
              return err(compileError("syntax", mismatch));
            }
          }
        }
        // A call's type is the function's return type.
        setNodeType(node, sig.returnType);
        return ok(undefined);
      }

      case "ref": {
        // Check the referenced expression.
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // A reference's type is "&" + the referenced value's type. A mutable
        // reference is "&mut " + the type.
        const valueType = inferType(node.value);
        const inner = valueType !== undefined ? valueType : "Int";
        setNodeType(node, node.isMut === true ? "&mut " + inner : "&" + inner);
        return ok(undefined);
      }

      case "deref": {
        // Check the referenced expression.
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // A dereference's type is the referenced type (strip the leading "&"
        // or "&mut ").
        const valueType = inferType(node.value);
        if (valueType !== undefined && valueType.startsWith("&")) {
          setNodeType(node, valueType.replace("&mut ", "").replace("&", ""));
        } else {
          setNodeType(node, "Int");
        }
        return ok(undefined);
      }

      case "deref_assign": {
        // Check the target reference and the assigned value.
        const targetResult = checkNode(node.target, ctx.asValue());
        if (!targetResult.ok) return targetResult;
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // The target must be a mutable reference.
        const targetType = inferType(node.target);
        if (targetType === undefined || !targetType.startsWith("&mut ")) {
          return err(
            scopeError("Cannot assign through an immutable reference"),
          );
        }
        // The assigned value's type must match the referenced type.
        const innerType = targetType.replace("&mut ", "");
        const valueType = inferType(node.value);
        if (valueType !== undefined) {
          const mismatch = typeMismatch(innerType, valueType);
          if (mismatch !== undefined) {
            return err(compileError("syntax", mismatch));
          }
        }
        return ok(undefined);
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
        // An empty block (or one whose last statement has no type) is Void.
        const last = node.statements[node.statements.length - 1];
        if (last !== undefined) {
          const lastType = inferType(last);
          if (lastType !== undefined) {
            setNodeType(node, lastType);
          } else {
            setNodeType(node, "Void");
          }
        } else {
          setNodeType(node, "Void");
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
        // A variable name must not collide with an existing function name.
        if (ctx.functions.has(node.name)) {
          return err(
            scopeError(
              "Name collision: '" + node.name + "' is already declared",
            ),
          );
        }
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
    const result = checkNode(
      stmt,
      createContext(initialScope, functions, false),
    );
    if (!result.ok) return result;
  }

  return ok(undefined);
}
