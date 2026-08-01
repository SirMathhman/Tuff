import type { ASTNode, FnSignature, StructField, Type } from "./ast";
import { isExpression } from "./ast";
import type { Result } from "./result";
import { ok, err, map } from "./result";
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

// Resolve the role of `this` in the current context: "receiver" when `this`
// is a method's receiver parameter (declared in scope), "constructor" when
// `this` is the implicit constructor object (via thisType), or "scope" for a
// bare scope reference outside any function. This is the single source of
// truth for `this`'s meaning; codegen reads the resolved role from the node.
function resolveThisRole(
  ctx: CheckContext,
): "receiver" | "constructor" | "scope" {
  if (ctx.scope.typeOf("this") !== undefined) {
    return "receiver";
  }
  if (ctx.thisType !== undefined) {
    return "constructor";
  }
  return "scope";
}

// Look up a field `structName.property` in the struct table. Returns the
// field, or a scope error if the struct or field is unknown.
function findStructField(
  structs: Map<string, StructField[]>,
  structName: string,
  property: string,
): Result<StructField, CompileError> {
  const fields = structs.get(structName);
  const field = fields?.find((f) => f.name === property);
  if (field === undefined) {
    return err(
      scopeError(
        "Unknown field '" + property + "' on struct '" + structName + "'",
      ),
    );
  }
  return ok(field);
}

// Resolve a field access `structName.property` against the struct table.
// Returns the field's type, or a scope error if the struct or field is
// unknown.
function resolveStructField(
  structs: Map<string, StructField[]>,
  structName: string,
  property: string,
): Result<Type, CompileError> {
  return map(findStructField(structs, structName, property), (field) => {
    return field.type;
  });
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
  // The type of the enclosing function's `this`, preserved when entering a
  // nested function. Used to resolve `this.this` (a reference to the outer
  // constructor's `this` from a nested constructor).
  outerThisType: Type | undefined;
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
  outerThisType: Type | undefined = undefined,
): CheckContext {
  return {
    scope,
    functions,
    structs,
    valueContext,
    thisType,
    outerThisType,
    asValue() {
      return createContext(
        scope,
        functions,
        structs,
        true,
        thisType,
        outerThisType,
      );
    },
    inChildScope() {
      return createContext(
        scope.child(),
        functions,
        structs,
        valueContext,
        thisType,
        outerThisType,
      );
    },
    withThis(newThisType) {
      // When entering a new function body, the current `this` becomes the
      // outer `this` for any nested functions.
      return createContext(
        scope,
        functions,
        structs,
        valueContext,
        newThisType,
        thisType,
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
        // A function name used as a value (a first-class function) resolves
        // to a function type built from its signature.
        if (ctx.functions.has(node.name)) {
          const sig = ctx.functions.get(node.name)!;
          setNodeType(node, {
            kind: "function",
            params: sig.params.map((p) => p.type),
            returnType: sig.returnType,
          });
          return ok(undefined);
        }
        if (!ctx.scope.isDeclared(node.name)) {
          return err(scopeError("Undeclared identifier: '" + node.name + "'"));
        }
        setNodeType(
          node,
          ctx.scope.typeOf(node.name) ?? { kind: "named", name: "Int" },
        );
        return ok(undefined);

      case "this": {
        // `this` may be a receiver parameter (declared in scope), the
        // implicit constructor object (via thisType), or a bare scope
        // reference. Resolve its role once here so codegen can derive its
        // behavior from it instead of re-deriving it from string/flag
        // heuristics.
        const scopeType = ctx.scope.typeOf("this");
        node.thisRole = resolveThisRole(ctx);
        node.thisIsRef = scopeType !== undefined && scopeType.kind === "ref";
        setNodeType(node, scopeType ?? ctx.thisType ?? { kind: "this" });
        return ok(undefined);
      }

      case "member_access": {
        // `this.x` refers to the variable `x` in the current scope when
        // `this` is a bare scope reference (outside a function). Inside a
        // function, `this` is a constructor object (an implicit struct), so
        // `this.x` resolves the field `x` on that struct.
        if (node.object.kind === "this") {
          // `this.this` is a reference to the enclosing function's `this`
          // (the outer constructor object) from a nested constructor.
          if (node.property === "this") {
            const outerType = ctx.outerThisType;
            if (outerType !== undefined) {
              setNodeType(node, {
                kind: "ref",
                inner: outerType,
                isMut: false,
              });
              return ok(undefined);
            }
            return err(
              scopeError("'this.this' is only valid inside a nested function"),
            );
          }
          // `this` may be a receiver parameter (declared in scope with a
          // struct type) or the implicit constructor object (via thisType).
          // Record its role so codegen can emit `this.x` correctly.
          node.object.thisRole = resolveThisRole(ctx);
          const thisType = ctx.scope.typeOf("this") ?? ctx.thisType;
          node.object.thisIsRef =
            thisType !== undefined && thisType.kind === "ref";
          // A receiver may be a reference to a struct (`&Wrapper`), so unwrap
          // a ref type to resolve the underlying struct's fields.
          const structType =
            thisType !== undefined && thisType.kind === "ref"
              ? thisType.inner
              : thisType;
          if (structType !== undefined && structType.kind === "struct") {
            const fieldResult = resolveStructField(
              ctx.structs,
              structType.name,
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
        // The checked type may be a declared struct (e.g. `this is Counter`),
        // so resolve a named type to a struct type when it refers to one.
        const typeName: Type = resolveStructType(node.typeName, ctx);
        if (!isKnownType(typeName)) {
          return err(
            compileError(
              "syntax",
              "Unknown type: '" + formatType(node.typeName) + "'",
            ),
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
        // Each parameter type must be a known type (or a declared struct).
        for (const param of node.params) {
          const resolved = resolveStructType(param.type, ctx);
          if (!isKnownType(resolved)) {
            return err(
              compileError(
                "syntax",
                "Unknown type: '" + formatType(param.type) + "'",
              ),
            );
          }
        }
        // A function is a constructor when its body is `this` (or `this.field`,
        // or a block ending in `this`) AND it has no `this` parameter (a
        // function with a `this` param is a method, not a constructor). It
        // implicitly defines a struct whose fields are the function's
        // parameters. The struct's name comes from an explicit return
        // annotation (`: Wrapper`) or, when the annotation is omitted (the
        // default `Int` return type), from the function's own name. This lets
        // `this` (the constructor object), `Wrapper(100).field`, and a method
        // receiver like `fn get(this : Wrapper)` resolve the fields. The
        // struct lives in its own namespace, so it coexists with the function
        // of the same name.
        const hasThisParam = node.params.some((p) => p.name === "this");
        const lastStmt =
          node.body.kind === "block"
            ? node.body.statements[node.body.statements.length - 1]
            : undefined;
        const isConstructorBody =
          !hasThisParam &&
          (node.body.kind === "this" ||
            (node.body.kind === "member_access" &&
              node.body.object.kind === "this") ||
            (node.body.kind === "is" && node.body.value.kind === "this") ||
            (node.body.kind === "block" &&
              (lastStmt?.kind === "this" ||
                (lastStmt?.kind === "is" && lastStmt.value.kind === "this"))));
        const explicitStructName =
          node.returnType.kind === "named" && !isKnownType(node.returnType)
            ? node.returnType.name
            : undefined;
        const implicitStructName =
          explicitStructName ??
          (isConstructorBody &&
          node.returnType.kind === "named" &&
          node.returnType.name === "Int"
            ? node.name
            : undefined);
        // Record whether this function is a constructor. This is the single
        // source of truth for constructor-ness; codegen reads it instead of
        // re-deriving it from the body shape.
        node.isConstructor = implicitStructName !== undefined;
        // Record the function's signature so calls can validate arguments.
        // The implicit struct name is stored on the signature so the call
        // case can resolve a constructor call's return type directly. The
        // receiver's reference-ness (whether the `this` param is a reference
        // type) and its fully-resolved type are also recorded here as the
        // single source of truth. Param types are resolved at definition time
        // so a `&mut this` receiver shorthand resolves to the enclosing
        // struct.
        const thisParam = node.params.find((p) => p.name === "this");
        const thisIsRef =
          thisParam !== undefined && thisParam.type.kind === "ref";
        const resolvedParams = node.params.map((p) => ({
          name: p.name,
          type: resolveStructType(p.type, ctx),
        }));
        const receiverType =
          thisParam !== undefined
            ? resolveStructType(thisParam.type, ctx)
            : undefined;
        ctx.functions.set(node.name, {
          params: resolvedParams,
          returnType: node.returnType,
          implicitStructName,
          thisIsRef,
          receiverType,
        });
        const implicitStruct: Type | undefined =
          implicitStructName !== undefined
            ? { kind: "struct", name: implicitStructName }
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
                  isMut: stmt.isMut === true,
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
          fnCtx.scope.declare(
            param.name,
            false,
            resolveStructType(param.type, ctx),
          );
        }
        // Check the body in a child scope where the parameters are declared
        // (immutable, with their declared types). The body is checked in
        // statement context so a block body may end in an assignment (e.g. a
        // mutating method like `fn add(this : &mut Counter) => { this.value += 1; }`).
        const bodyResult = checkNode(node.body, fnCtx);
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
        // The called function must be declared, OR the callee must be a
        // variable whose type is a function type (a first-class function).
        const sig = ctx.functions.get(node.name);
        const calleeType = ctx.scope.typeOf(node.name);
        const fnType =
          calleeType !== undefined && calleeType.kind === "function"
            ? calleeType
            : undefined;
        if (sig === undefined && fnType === undefined) {
          return err(scopeError("Undeclared function: '" + node.name + "'"));
        }
        // A method call (`obj.method(args)`) prepends the receiver as the
        // first argument. If the callee has no `this` parameter (it's a plain
        // function, not a method), drop the receiver so the argument count
        // matches. This lets `Outer().Inner()` call a nested constructor
        // `Inner` that has no `this` param. Only applies to declared
        // functions (a first-class function value has no named params).
        if (
          node.methodCall === true &&
          node.args.length > 0 &&
          sig !== undefined
        ) {
          const hasThisParam = sig.params.some((p) => p.name === "this");
          if (!hasThisParam) {
            node.args = node.args.slice(1);
          }
        }
        // Check each argument expression.
        for (const arg of node.args) {
          const argResult = checkNode(arg, ctx.asValue());
          if (!argResult.ok) return argResult;
        }
        // Resolve the parameter types and return type from either the
        // declared signature or the callee's function type.
        const paramTypes: Type[] =
          sig !== undefined
            ? sig.params.map((p) => resolveStructType(p.type, ctx))
            : fnType!.params;
        const declaredReturn: Type =
          sig !== undefined ? sig.returnType : fnType!.returnType;
        // Validate the argument count and each argument's type against the
        // function's declared parameters.
        if (node.args.length !== paramTypes.length) {
          return err(
            scopeError(
              "Function '" +
                node.name +
                "' expects " +
                paramTypes.length +
                " arguments, got " +
                node.args.length,
            ),
          );
        }
        for (let i = 0; i < node.args.length; i++) {
          const arg = node.args[i]!;
          const param = paramTypes[i]!;
          const argType = inferType(arg);
          if (argType !== undefined) {
            // A method receiver may be auto-referenced: when the first
            // argument is a struct value and the `this` parameter is a
            // reference to that struct (`&Wrapper`), the receiver is wrapped
            // in a reference automatically. This lets `wrapper.get()` call
            // `fn get(this : &Wrapper)`. The receiver's fully-resolved type
            // comes from the signature (recorded in fn_decl), so no
            // re-resolution is needed here.
            const receiverType = sig?.receiverType;
            const isAutoRefReceiver =
              i === 0 &&
              receiverType !== undefined &&
              receiverType.kind === "ref" &&
              argType.kind === "struct" &&
              receiverType.inner.kind === "struct" &&
              receiverType.inner.name === argType.name;
            if (isAutoRefReceiver) {
              node.autoRefReceiver = true;
              continue;
            }
            const mismatch = typeMismatch(param, argType);
            if (mismatch !== undefined) {
              return err(compileError("syntax", mismatch));
            }
          }
        }
        // A call's type is the function's return type. If the function is a
        // constructor, resolve the return type to the struct type so field
        // access works. The constructor's implicit struct name was recorded on
        // the signature in fn_decl, so read it directly rather than re-deriving
        // it from the return type and struct table.
        const constructorStructName =
          sig !== undefined ? sig.implicitStructName : undefined;
        const returnType: Type =
          constructorStructName !== undefined
            ? { kind: "struct", name: constructorStructName }
            : declaredReturn;
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
        // The assignment target is a uniform ASTNode. Dispatch on its kind:
        // an `identifier` is a plain variable assignment (`x = 100`); a
        // `member_access` on `this` is either a scope-variable assignment
        // (`this.x = 100` for a bare scope reference) or a struct-field
        // mutation through a receiver (`this.value = 100` when `this` is a
        // struct or `&mut` struct receiver); a `member_access` on another
        // object is a struct-field assignment (`value.field = 100`).
        const target = node.target;
        if (target.kind === "member_access" && target.object.kind === "this") {
          // `this.x` may be a struct-field mutation when `this` is a struct
          // receiver (or a reference to one). Resolve `this`'s type; if it
          // unwraps to a struct, treat this as a field mutation.
          const thisType = ctx.scope.typeOf("this") ?? ctx.thisType;
          target.object.thisIsRef =
            thisType !== undefined && thisType.kind === "ref";
          const structType =
            thisType !== undefined && thisType.kind === "ref"
              ? thisType.inner
              : thisType;
          if (structType !== undefined && structType.kind === "struct") {
            return checkFieldAssignment(
              ctx,
              structType.name,
              target.property,
              node.value,
            );
          }
          // Otherwise `this.x` is a bare scope reference to variable `x`.
          if (!ctx.scope.isDeclared(target.property)) {
            return err(
              scopeError("Undeclared identifier: '" + target.property + "'"),
            );
          }
          if (!ctx.scope.isMutable(target.property)) {
            return err(
              scopeError(
                "Cannot assign to immutable variable: '" +
                  target.property +
                  "'",
              ),
            );
          }
          return checkNode(node.value, ctx.asValue());
        }
        if (target.kind === "member_access" && target.object.kind !== "this") {
          // Struct-field assignment: validate the object, resolve the field,
          // and enforce that the field is mutable and the value type matches.
          const targetResult = checkNode(target.object, ctx.asValue());
          if (!targetResult.ok) return targetResult;
          // Assigning to a field of a variable requires the variable itself
          // to be mutable (`let mut value = ...`), even if the field is
          // mutable. A plain identifier object must be declared and mutable.
          if (target.object.kind === "identifier") {
            if (!ctx.scope.isDeclared(target.object.name)) {
              return err(
                scopeError(
                  "Undeclared identifier: '" + target.object.name + "'",
                ),
              );
            }
            if (!ctx.scope.isMutable(target.object.name)) {
              return err(
                scopeError(
                  "Cannot assign to field of immutable variable: '" +
                    target.object.name +
                    "'",
                ),
              );
            }
          }
          const objectType = inferType(target.object);
          if (objectType === undefined || objectType.kind !== "struct") {
            return err(
              scopeError(
                "Cannot assign to field of non-struct value: '" +
                  target.property +
                  "'",
              ),
            );
          }
          return checkFieldAssignment(
            ctx,
            objectType.name,
            target.property,
            node.value,
          );
        }
        // Plain variable assignment (`x = 100`) or `this.x = 100`. Both
        // resolve to a variable name in the current scope.
        let name: string;
        if (target.kind === "identifier") {
          name = target.name;
        } else if (target.kind === "member_access") {
          name = target.property;
        } else {
          return err(
            scopeError("Left-hand side of assignment must be an identifier"),
          );
        }
        if (!ctx.scope.isDeclared(name)) {
          return err(scopeError("Undeclared identifier: '" + name + "'"));
        }
        if (!ctx.scope.isMutable(name)) {
          return err(
            scopeError("Cannot assign to immutable variable: '" + name + "'"),
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

  // Validate a struct-field assignment `structName.property = value`: the
  // field must exist, be mutable, and the value's type must match the field's
  // type. Returns ok(undefined) on success, or a scope/syntax error otherwise.
  function checkFieldAssignment(
    ctx: CheckContext,
    structName: string,
    property: string,
    value: ASTNode,
  ): Result<void, CompileError> {
    const fieldResult = findStructField(ctx.structs, structName, property);
    if (!fieldResult.ok) return fieldResult;
    const field = fieldResult.value;
    if (field.isMut !== true) {
      return err(
        scopeError(
          "Cannot assign to immutable field '" +
            property +
            "' on struct '" +
            structName +
            "'",
        ),
      );
    }
    const valueResult = checkNode(value, ctx.asValue());
    if (!valueResult.ok) return valueResult;
    const valueType = inferType(value);
    if (valueType !== undefined) {
      const mismatch = typeMismatch(field.type, valueType);
      if (mismatch !== undefined) {
        return err(compileError("syntax", mismatch));
      }
    }
    return ok(undefined);
  }

  // If a named type refers to a declared struct, return it as a StructType.
  // Recurses into composite types (ref, array, tuple) so a struct nested
  // inside them (e.g. `&Wrapper`, `[Wrapper; 2]`) also resolves.
  function resolveStructType(t: Type, ctx: CheckContext): Type {
    if (t.kind === "named") {
      if (ctx.structs.has(t.name)) {
        return { kind: "struct", name: t.name };
      }
      return t;
    }
    if (t.kind === "this") {
      // A `this` inner type (from the `&mut this` receiver shorthand)
      // resolves to the enclosing struct (ctx.thisType).
      return ctx.thisType ?? t;
    }
    if (t.kind === "ref") {
      return {
        kind: "ref",
        inner: resolveStructType(t.inner, ctx),
        isMut: t.isMut,
      };
    }
    if (t.kind === "array") {
      return {
        kind: "array",
        elem: resolveStructType(t.elem, ctx),
        length: t.length,
      };
    }
    if (t.kind === "tuple") {
      return {
        kind: "tuple",
        elements: t.elements.map((e) => resolveStructType(e, ctx)),
      };
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
