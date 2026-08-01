import type { ASTNode, FnSignature, StructField, Type } from "./ast";
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
  formatType,
} from "./types";

function scopeError(message: string): CompileError {
  return compileError("scope", message);
}

// Return an error if `valueType` is the special ThisType (the type of the
// compile-time scope reference `this`), which cannot be used as a runtime
// value. Returns undefined if the type is not `this`.
function rejectThisType(
  valueType: Type | undefined,
  message: string,
): CompileError | undefined {
  if (valueType !== undefined && valueType.kind === "this") {
    return scopeError(message);
  }
  return undefined;
}

// Return a scope error if `name` collides with an existing function, struct,
// or variable. Returns undefined if the name is free.
function checkNameCollision(
  ctx: CheckContext,
  name: string,
): CompileError | undefined {
  if (
    ctx.functions.has(name) ||
    ctx.structs.has(name) ||
    ctx.scope.isDeclared(name)
  ) {
    return scopeError("Name collision: '" + name + "' is already declared");
  }
  return undefined;
}

// Resolve a field access `structName.property` against the struct table.
// Returns the field's type, or a scope error if the struct or field is
// unknown.
function resolveStructField(
  structs: Map<string, StructField[]>,
  structName: string,
  property: string,
): Result<Type, CompileError> {
  const fields = structs.get(structName);
  const field = fields?.find((f) => f.name === property);
  if (field === undefined) {
    return err(
      scopeError(
        "Unknown field '" + property + "' on struct '" + structName + "'",
      ),
    );
  }
  return ok(field.type);
}

// CheckContext encapsulates the state threaded through semantic checking:
// the current scope, the function/struct tables, and whether the node's
// value is being used (as opposed to being evaluated as a standalone
// statement). A block used as a value must end in a pure expression; a block
// used as a statement may not.
interface CheckContext {
  scope: Scope;
  // Functions and structs live in separate namespaces so a constructor
  // function and its implicit struct can share a name.
  functions: Map<string, FnSignature>;
  structs: Map<string, StructField[]>;
  valueContext: boolean;
  // The type of `this` in the current function body. Undefined outside a
  // function (where `this` is a bare scope reference, not a value).
  thisType: Type | undefined;
  // Return a context that evaluates the node as a value.
  asValue(): CheckContext;
  // Return a context with a child scope (for blocks).
  inChildScope(): CheckContext;
  // Return a context where `this` has the given type (for function bodies).
  withThis(thisType: Type | undefined): CheckContext;
}

function createContext(
  scope: Scope,
  functions: Map<string, FnSignature>,
  structs: Map<string, StructField[]>,
  valueContext: boolean,
  thisType: Type | undefined,
): CheckContext {
  return {
    scope,
    functions,
    structs,
    valueContext,
    thisType,
    asValue() {
      return createContext(scope, functions, structs, true, thisType);
    },
    inChildScope() {
      return createContext(
        scope.child(),
        functions,
        structs,
        valueContext,
        thisType,
      );
    },
    withThis(newThisType) {
      return createContext(
        scope,
        functions,
        structs,
        valueContext,
        newThisType,
      );
    },
  };
}

export function validateScope(
  stmts: ASTNode[],
  initialScope: Scope,
): Result<void, CompileError> {
  // Functions and structs live in separate namespaces.
  const functions = new Map<string, FnSignature>();
  const structs = new Map<string, StructField[]>();

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
        setNodeType(node, { kind: "named", name: node.suffix ?? "Int" });
        return ok(undefined);
      }

      case "boolean":
        // Always valid
        setNodeType(node, { kind: "named", name: "Bool" });
        return ok(undefined);

      case "identifier":
        if (!ctx.scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        setNodeType(
          node,
          ctx.scope.typeOf(node.name) ?? { kind: "named", name: "Int" },
        );
        return ok(undefined);

      case "this":
        // If `this` is declared in the current scope (as a receiver
        // parameter of a method), it resolves to that parameter's type.
        // Otherwise, inside a constructor function it is the constructor
        // object (an implicit struct); outside any function it is a bare
        // scope reference with the special ThisType, which the type system
        // treats as non-assignable to any real type.
        setNodeType(
          node,
          ctx.scope.typeOf("this") ?? ctx.thisType ?? { kind: "this" },
        );
        return ok(undefined);

      case "member_access": {
        // `this.x` refers to the variable `x` in the current scope when
        // `this` is a bare scope reference (outside a function). Inside a
        // function, `this` is a constructor object (an implicit struct), so
        // `this.x` resolves the field `x` on that struct.
        if (node.object.kind === "this") {
          const thisType = ctx.thisType;
          if (thisType !== undefined && thisType.kind === "struct") {
            const fieldResult = resolveStructField(
              ctx.structs,
              thisType.name,
              node.property,
            );
            if (!fieldResult.ok) return fieldResult;
            setNodeType(node, fieldResult.value);
            return ok(undefined);
          }
          if (!ctx.scope.isDeclared(node.property)) {
            return err(
              scopeError("Undeclared identifier: '" + node.property + "'"),
            );
          }
          setNodeType(
            node,
            ctx.scope.typeOf(node.property) ?? { kind: "named", name: "Int" },
          );
          return ok(undefined);
        }
        // Validate the object and that the property exists on a struct.
        const objectResult = checkNode(node.object, ctx.asValue());
        if (!objectResult.ok) return objectResult;
        const objectType = inferType(node.object);
        if (objectType !== undefined && objectType.kind === "struct") {
          const fieldResult = resolveStructField(
            ctx.structs,
            objectType.name,
            node.property,
          );
          if (!fieldResult.ok) return fieldResult;
          setNodeType(node, fieldResult.value);
        } else {
          setNodeType(node, { kind: "named", name: "Int" });
        }
        return ok(undefined);
      }

      case "binary_op": {
        const leftResult = checkNode(node.left, ctx.asValue());
        if (!leftResult.ok) return leftResult;
        const rightResult = checkNode(node.right, ctx.asValue());
        if (!rightResult.ok) return rightResult;
        // A binary op's type is the type of its operands (they must agree).
        setNodeType(
          node,
          inferType(node.left) ??
            inferType(node.right) ?? { kind: "named", name: "Int" },
        );
        return ok(undefined);
      }

      case "is": {
        // Validate the value expression, and that the type name is known.
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        const typeName: Type = { kind: "named", name: node.typeName };
        if (!isKnownType(typeName)) {
          return err(
            compileError("syntax", "Unknown type: '" + node.typeName + "'"),
          );
        }
        // Compute the compile-time result: whether the value's inferred type
        // matches the checked type (type identity, not assignability).
        const valueType = inferType(node.value);
        node.result =
          valueType !== undefined && typeMatches(valueType, typeName);
        setNodeType(node, { kind: "named", name: "Bool" });
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
            inferType(node.thenBranch) ??
              inferType(node.elseBranch) ?? { kind: "named", name: "Int" },
          );
        } else {
          setNodeType(
            node,
            inferType(node.thenBranch) ?? { kind: "named", name: "Int" },
          );
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
        // A function name must not collide with an existing function, struct,
        // or variable.
        const collision = checkNameCollision(ctx, node.name);
        if (collision !== undefined) return err(collision);
        // The return type must be a known type, OR a named type that will
        // become an implicit struct (a constructor function whose fields are
        // its parameters).
        if (!isKnownType(node.returnType) && node.returnType.kind !== "named") {
          return err(
            compileError(
              "syntax",
              "Unknown type: '" + formatType(node.returnType) + "'",
            ),
          );
        }
        // Each parameter type must be a known type.
        for (const param of node.params) {
          if (!isKnownType(param.type)) {
            return err(
              compileError(
                "syntax",
                "Unknown type: '" + formatType(param.type) + "'",
              ),
            );
          }
        }
        // Record the function's signature so calls can validate arguments.
        ctx.functions.set(node.name, {
          params: node.params,
          returnType: node.returnType,
        });
        // If the return type is a named type that is NOT a known primitive
        // type, it implicitly defines a struct whose fields are the function's
        // parameters. This lets `this` (the constructor object) and
        // `Wrapper(100).field` resolve the fields. The struct lives in its own
        // namespace, so it coexists with the function of the same name.
        const implicitStruct: Type | undefined =
          node.returnType.kind === "named" && !isKnownType(node.returnType)
            ? { kind: "struct", name: node.returnType.name }
            : undefined;
        if (implicitStruct !== undefined) {
          // The struct's fields come from the parameters plus any `let`
          // declarations in the body block (so `{ let field = 100; this }`
          // makes `this.field` available).
          const fields: StructField[] = node.params.map((p) => ({
            name: p.name,
            type: p.type,
          }));
          if (node.body.kind === "block") {
            for (const stmt of node.body.statements) {
              if (stmt.kind === "let_decl") {
                fields.push({
                  name: stmt.name,
                  type: stmt.typeAnnotation ??
                    inferType(stmt.value) ?? { kind: "named", name: "Int" },
                });
              }
            }
          }
          ctx.structs.set(implicitStruct.name, fields);
        }
        // Check the body in a child scope where the parameters are declared
        // (immutable, with their declared types). Inside the body, `this` is
        // the constructor object of the implicit struct (if the return type
        // is a named type).
        const fnCtx = ctx.inChildScope().withThis(implicitStruct);
        for (const param of node.params) {
          fnCtx.scope.declare(param.name, false, param.type);
        }
        const bodyResult = checkNode(node.body, fnCtx.asValue());
        if (!bodyResult.ok) return bodyResult;
        // The body's type must be assignable to the declared return type.
        // When the return type is an implicit struct, compare against the
        // struct type (so `this`, which has the struct type, is accepted).
        const bodyType = inferType(node.body);
        const returnType: Type = implicitStruct ?? node.returnType;
        // When the return type is the generic "Int" (the default when the
        // annotation is omitted), infer it from the body rather than checking
        // assignability (which would reject a concrete body type like I32).
        const isDefaultReturn =
          node.returnType.kind === "named" && node.returnType.name === "Int";
        if (bodyType !== undefined && !isDefaultReturn) {
          const mismatch = typeMismatch(returnType, bodyType);
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
        // A call's type is the function's return type. If the function is a
        // constructor (its return type is an implicit struct), resolve the
        // return type to the struct type so field access works.
        const returnType: Type =
          sig.returnType.kind === "named" &&
          ctx.structs.has(sig.returnType.name)
            ? { kind: "struct", name: sig.returnType.name }
            : sig.returnType;
        setNodeType(node, returnType);
        return ok(undefined);
      }

      case "struct_decl": {
        // A struct name must not collide with an existing function, struct,
        // or variable.
        const collision = checkNameCollision(ctx, node.name);
        if (collision !== undefined) return err(collision);
        // Each field type must be a known type.
        for (const field of node.fields) {
          if (!isKnownType(field.type)) {
            return err(
              compileError(
                "syntax",
                "Unknown type: '" + formatType(field.type) + "'",
              ),
            );
          }
        }
        // Record the struct's fields.
        ctx.structs.set(node.name, node.fields);
        return ok(undefined);
      }

      case "struct_init": {
        // The struct must be declared.
        const fields = ctx.structs.get(node.name);
        if (fields === undefined) {
          return err(scopeError("Undeclared struct: '" + node.name + "'"));
        }
        // Check each field value expression.
        for (const field of node.fields) {
          const valueResult = checkNode(field.value, ctx.asValue());
          if (!valueResult.ok) return valueResult;
        }
        // Validate that all declared fields are provided with matching types.
        for (const declared of fields) {
          const provided = node.fields.find((f) => f.name === declared.name);
          if (provided === undefined) {
            return err(
              scopeError(
                "Missing field '" +
                  declared.name +
                  "' in struct '" +
                  node.name +
                  "'",
              ),
            );
          }
          const valueType = inferType(provided.value);
          if (valueType !== undefined) {
            const mismatch = typeMismatch(declared.type, valueType);
            if (mismatch !== undefined) {
              return err(compileError("syntax", mismatch));
            }
          }
        }
        // A struct init's type is the struct type.
        setNodeType(node, { kind: "struct", name: node.name });
        return ok(undefined);
      }

      case "ref": {
        // Check the referenced expression.
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // `this` is a compile-time scope reference, not a runtime value, so
        // it cannot be referenced. Its ThisType is not a valid inner type.
        const valueType = inferType(node.value);
        const thisErr = rejectThisType(
          valueType,
          "Cannot take a reference to 'this'",
        );
        if (thisErr !== undefined) return err(thisErr);
        // A reference's type wraps the referenced value's type.
        const inner: Type =
          valueType !== undefined ? valueType : { kind: "named", name: "Int" };
        setNodeType(node, { kind: "ref", inner, isMut: node.isMut === true });
        return ok(undefined);
      }

      case "deref": {
        // Check the referenced expression.
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // A dereference's type is the referenced type (unwrap the ref).
        const valueType = inferType(node.value);
        if (valueType !== undefined && valueType.kind === "ref") {
          setNodeType(node, valueType.inner);
        } else {
          setNodeType(node, { kind: "named", name: "Int" });
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
        if (
          targetType === undefined ||
          targetType.kind !== "ref" ||
          !targetType.isMut
        ) {
          return err(
            scopeError("Cannot assign through an immutable reference"),
          );
        }
        // The assigned value's type must match the referenced type.
        const innerType = targetType.inner;
        const valueType = inferType(node.value);
        if (valueType !== undefined) {
          const mismatch = typeMismatch(innerType, valueType);
          if (mismatch !== undefined) {
            return err(compileError("syntax", mismatch));
          }
        }
        return ok(undefined);
      }

      case "array": {
        // Check each element expression.
        for (const elem of node.elements) {
          const elemResult = checkNode(elem, ctx.asValue());
          if (!elemResult.ok) return elemResult;
        }
        // An array's type wraps the element type and records the length.
        const first = node.elements[0];
        const firstType = first !== undefined ? inferType(first) : undefined;
        const elemType: Type =
          firstType !== undefined ? firstType : { kind: "named", name: "Int" };
        setNodeType(node, {
          kind: "array",
          elem: elemType,
          length: node.elements.length,
        });
        return ok(undefined);
      }

      case "index": {
        // Check the array and the index expression.
        const objectResult = checkNode(node.object, ctx.asValue());
        if (!objectResult.ok) return objectResult;
        const indexResult = checkNode(node.index, ctx.asValue());
        if (!indexResult.ok) return indexResult;
        // The object must be an array type; the index's type is the element type.
        const objectType = inferType(node.object);
        if (objectType !== undefined && objectType.kind === "array") {
          setNodeType(node, objectType.elem);
        } else {
          setNodeType(node, { kind: "named", name: "Int" });
        }
        return ok(undefined);
      }

      case "tuple": {
        // Check each element expression.
        for (const elem of node.elements) {
          const elemResult = checkNode(elem, ctx.asValue());
          if (!elemResult.ok) return elemResult;
        }
        // A tuple's type wraps the element types.
        const elements: Type[] = node.elements.map(
          (elem) => inferType(elem) ?? { kind: "named", name: "Int" },
        );
        setNodeType(node, { kind: "tuple", elements });
        return ok(undefined);
      }

      case "tuple_index": {
        // Check the tuple expression.
        const objectResult = checkNode(node.object, ctx.asValue());
        if (!objectResult.ok) return objectResult;
        // The object must be a tuple type; the index's type is the element type.
        const objectType = inferType(node.object);
        if (objectType !== undefined && objectType.kind === "tuple") {
          const elem = objectType.elements[node.index];
          if (elem === undefined) {
            return err(
              scopeError(
                "Tuple index " +
                  node.index +
                  " out of bounds for tuple of arity " +
                  objectType.elements.length,
              ),
            );
          }
          setNodeType(node, elem);
        } else {
          setNodeType(node, { kind: "named", name: "Int" });
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
            setNodeType(node, { kind: "named", name: "Void" });
          }
        } else {
          setNodeType(node, { kind: "named", name: "Void" });
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
        // A variable name must not collide with an existing function or struct.
        if (ctx.functions.has(node.name) || ctx.structs.has(node.name)) {
          return err(
            scopeError(
              "Name collision: '" + node.name + "' is already declared",
            ),
          );
        }
        // Validate the value expression first (RHS)
        const valueResult = checkNode(node.value, ctx.asValue());
        if (!valueResult.ok) return valueResult;
        // `this` is a compile-time scope reference, not a runtime value, so
        // it cannot be bound to a variable. Its ThisType is not a valid value
        // type, regardless of whether an annotation is present.
        const valueType = inferType(node.value);
        const thisErr = rejectThisType(
          valueType,
          "Cannot bind 'this' to a variable",
        );
        if (thisErr !== undefined) return err(thisErr);
        // If a type annotation is present, it must name a known type, and the
        // value's type must be assignable to it (widening allowed, narrowing
        // rejected, different kinds rejected).
        if (node.typeAnnotation !== undefined) {
          // A named type annotation may refer to a declared struct.
          const annotation = resolveStructType(node.typeAnnotation, ctx);
          if (!isKnownType(annotation)) {
            return err(
              compileError(
                "syntax",
                "Unknown type: '" + formatType(annotation) + "'",
              ),
            );
          }
          const mismatch =
            valueType !== undefined
              ? typeMismatch(annotation, valueType)
              : undefined;
          if (mismatch !== undefined) {
            return err(compileError("syntax", mismatch));
          }
        }
        // Then add the new variable to scope, recording its type (either the
        // annotation, or the inferred type of the value).
        const declaredType: Type =
          node.typeAnnotation !== undefined
            ? resolveStructType(node.typeAnnotation, ctx)
            : (valueType ?? { kind: "named", name: "Int" });
        ctx.scope.declare(node.name, node.isMut === true, declaredType);
        return ok(undefined);
      }
    }
  }

  // If a named type refers to a declared struct, return it as a StructType.
  function resolveStructType(t: Type, ctx: CheckContext): Type {
    if (t.kind === "named") {
      if (ctx.structs.has(t.name)) {
        return { kind: "struct", name: t.name };
      }
    }
    return t;
  }

  for (const stmt of stmts) {
    const result = checkNode(
      stmt,
      createContext(initialScope, functions, structs, false, undefined),
    );
    if (!result.ok) return result;
  }

  return ok(undefined);
}
