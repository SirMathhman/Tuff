import type { AstNode, LValue } from "../core/ast";
import type { Type } from "../core/types";
import { getOperatorCategory, TYPE_SUFFIXES } from "../core/grammar";
import { InterpreterError } from "../core/error";
import {
  arrayType,
  bool,
  dynamic,
  isAssignable,
  isDynamic,
  isPointer,
  isStruct,
  pointer,
  resolveBuiltinType,
  structType,
  tupleType,
  typeName,
  typeParam,
  unionType,
  voidType,
  widen,
} from "../core/types";

/**
 * Semantic analysis stage: resolves all type information onto AST nodes,
 * validates type compatibility, and builds a symbol table.
 *
 * Single-pass bottom-up approach:
 * 1. Resolve child types recursively
 * 2. Compute result type and write it onto the AST node
 * 3. Context propagation: dynamic operands inherit from concrete siblings
 * 4. Build symbol table with inferred types
 * 5. Validate type compatibility on declarations
 */

/** A variable declaration in the symbol table. */
interface VarDeclaration {
  kind: "var";
  type: Type;
  mutable: boolean;
}

/** A function declaration in the symbol table. */
interface FnDeclaration {
  kind: "fn";
  returnType: Type;
  params: { name: string; type: Type }[];
  typeParams?: string[];
}

/** A declaration in the symbol table (variable or function). */
type Declaration = VarDeclaration | FnDeclaration;

/**
 * Analysis scope: bundles declarations with optional type param bindings.
 * Threading a single object through recursive calls avoids parameter drift
 * and makes it impossible to forget type param context.
 */
interface Scope {
  declarations: Map<string, Declaration>;
  typeParams?: Map<string, Type>;
}

/** Check that a variable is mutable, throwing a type error if not. */
function checkMutable(
  name: string,
  scope: Scope,
  pos?: { line: number; column: number },
): void {
  const decl = scope.declarations.get(name);
  if (decl && decl.kind === "var" && !decl.mutable) {
    throw new InterpreterError(
      "type",
      `Cannot assign to immutable variable: ${name}`,
      pos,
    );
  }
}

/** Register a declaration, throwing if it already exists. */
function registerDeclaration(
  name: string,
  scope: Scope,
  decl: Declaration,
  pos?: { line: number; column: number },
): void {
  const existing = scope.declarations.get(name);
  if (existing) {
    throw new InterpreterError("type", `Duplicate declaration: '${name}'`, pos);
  }
  scope.declarations.set(name, decl);
}

/** Validate mutability of an LValue and resolve its type. */
function checkLValue(
  lv: LValue,
  scope: Scope,
  pos?: { line: number; column: number },
): Type {
  switch (lv.kind) {
    case "identifier":
      checkMutable(lv.name, scope, pos);
      return resolveLValueType(lv, scope);
    case "index":
      checkLValue(lv.target, scope, pos);
      return resolveLValueType(lv, scope);
    case "deref": {
      const operandType = resolveType(lv.operand, scope);
      if (isPointer(operandType) && !operandType.mutable) {
        throw new InterpreterError(
          "type",
          "Cannot assign through immutable pointer",
          pos,
        );
      }
      return resolveLValueType(lv, scope);
    }
  }
}

/** Resolve the type of an LValue target (read-only, no mutability check). */
function resolveLValueType(lv: LValue, scope: Scope): Type {
  switch (lv.kind) {
    case "identifier": {
      const decl = scope.declarations.get(lv.name);
      if (decl && decl.kind === "var") return decl.type;
      return dynamic();
    }
    case "index": {
      const targetType = resolveLValueType(lv.target, scope);
      if (targetType.kind === "array") {
        return targetType.inner;
      }
      return dynamic();
    }
    case "deref": {
      const operandType = resolveType(lv.operand, scope);
      if (isPointer(operandType)) {
        return operandType.inner;
      }
      return dynamic();
    }
  }
}

/**
 * Resolve the type of a node, storing it on the AST where supported.
 * Also builds the declaration table and validates type compatibility.
 */
function resolveType(node: AstNode, scope: Scope): Type {
  switch (node.kind) {
    case "number": {
      // Keep un-suffixed as dynamic so context propagation works.
      // The I32 default is applied at the typecheck site.
      node.type = node.type ? resolveTypeNode(node.type, scope) : dynamic();
      // Validate numeric value fits within the resolved type's range.
      const resolvedType = node.type;
      if (resolvedType.kind === "numeric") {
        const suffixDef = TYPE_SUFFIXES.find(
          (s) => s.prefix === resolvedType.prefix,
        );
        if (suffixDef) {
          const minVal = suffixDef.min(resolvedType.bits);
          const maxVal = suffixDef.max(resolvedType.bits);
          if (node.value < minVal || node.value > maxVal) {
            throw new InterpreterError(
              "type",
              `Value ${node.value} out of range for ${resolvedType.prefix}${resolvedType.bits} (${minVal}-${maxVal})`,
              node.pos,
            );
          }
        }
      }
      return node.type;
    }

    case "boolean":
      node.type = bool();
      return node.type;

    case "unary": {
      const operandType = resolveType(node.operand, scope);
      switch (node.op) {
        case "-":
          node.type = operandType;
          return operandType;
        case "&":
          // Reference: operand must be an identifier
          if (node.operand.kind !== "identifier") {
            throw new InterpreterError(
              "type",
              "Can only take reference of an identifier",
              node.pos,
            );
          }
          node.type = pointer(operandType, false);
          return node.type;
        case "&mut":
          // Mutable reference: operand must be an identifier
          if (node.operand.kind !== "identifier") {
            throw new InterpreterError(
              "type",
              "Can only take reference of an identifier",
              node.pos,
            );
          }
          node.type = pointer(operandType, true);
          return node.type;
        case "*":
          // Dereference: operand must be a pointer
          if (!isPointer(operandType)) {
            throw new InterpreterError(
              "type",
              `Cannot dereference non-pointer type: ${typeName(operandType)}`,
              node.pos,
            );
          }
          node.type = operandType.inner;
          return operandType.inner;
      }
      break;
    }

    case "binary": {
      const leftType = resolveType(node.left, scope);
      const rightType = resolveType(node.right, scope);

      const category = getOperatorCategory(node.op);
      if (category === "arithmetic") {
        checkNotBool(leftType, node.op, node.pos);
        checkNotBool(rightType, node.op, node.pos);
        const result = widen(leftType, rightType);
        // Context propagation: dynamic operand inherits from concrete sibling
        if (isDynamic(leftType) && !isDynamic(rightType))
          setNodeType(node.left, rightType);
        if (isDynamic(rightType) && !isDynamic(leftType))
          setNodeType(node.right, leftType);
        node.type = result;
        return result;
      }

      if (category === "comparison") {
        node.type = bool();
        return bool();
      }

      if (category === "logical") {
        const result = widen(leftType, rightType);
        node.type = result;
        return result;
      }

      // Fallback
      node.type = dynamic();
      return dynamic();
    }

    case "identifier": {
      const decl = scope.declarations.get(node.name);
      if (decl && decl.kind === "var") {
        node.type = decl.type;
        return node.type;
      }
      node.type = dynamic();
      return node.type;
    }

    case "array": {
      // Infer element type from first element, or use declared type
      let elementType: Type = dynamic();
      for (const elem of node.elements) {
        const elemType = resolveType(elem, scope);
        if (!isDynamic(elementType) && !isDynamic(elemType)) {
          elementType = widen(elementType, elemType);
        } else if (isDynamic(elementType)) {
          elementType = elemType;
        }
      }
      // Use declared inner type if present
      const resolvedDeclType = node.type
        ? resolveTypeNode(node.type, scope)
        : undefined;
      if (resolvedDeclType && resolvedDeclType.kind === "array") {
        elementType = resolvedDeclType.inner;
      }
      node.type = arrayType(elementType, node.elements.length);
      return node.type;
    }

    case "index": {
      const targetType = resolveType(node.target, scope);
      const indexType = resolveType(node.index, scope);
      // Index must be numeric
      if (isDynamic(indexType)) {
        // Allow dynamic index
      }
      // Target must be an array type
      if (targetType.kind === "array") {
        node.type = targetType.inner;
      } else {
        node.type = dynamic();
      }
      return node.type;
    }

    case "let": {
      const existing = scope.declarations.get(node.name);
      if (existing && existing.kind === "fn") {
        throw new InterpreterError(
          "type",
          `Duplicate declaration: '${node.name}'`,
          node.pos,
        );
      }
      // Note: we allow shadowing vars with vars, so no registerDeclaration here
      // Reject void blocks (ending with declarations) as let values
      if (node.value.kind === "block") {
        const last = node.value.statements[node.value.statements.length - 1];
        if (last?.kind === "let") {
          throw new InterpreterError(
            "type",
            "Block used as expression cannot end with a declaration",
            node.pos,
          );
        }
      }
      const valueType = resolveType(node.value, scope);
      // Validate type compatibility
      if (node.type !== undefined) {
        checkAssignable(valueType, resolveTypeNode(node.type, scope), node.pos);
      }
      // Store the more specific type: declared type if present, otherwise inferred
      const resolvedType =
        (node.type ? resolveTypeNode(node.type, scope) : undefined) ??
        (isDynamic(valueType) ? dynamic() : valueType);
      scope.declarations.set(node.name, {
        kind: "var",
        type: resolvedType,
        mutable: node.mutable,
      });
      // Write the resolved type back onto the AST node for let
      return resolvedType ?? dynamic();
    }

    case "assign": {
      // Validate mutability and resolve target type in one pass
      const targetType = checkLValue(node.target, scope, node.pos);
      const valueType = resolveType(node.value, scope);
      // Check value compatibility with target type (or inner type if pointer)
      const checkType = isPointer(targetType) ? targetType.inner : targetType;
      if (!isDynamic(checkType)) {
        checkAssignable(valueType, checkType, node.pos);
      }
      return valueType;
    }

    case "block": {
      let result: Type = dynamic();
      for (const stmt of node.statements) {
        result = resolveType(stmt, scope);
      }
      // Blocks ending with a declaration have void type.
      const last = node.statements[node.statements.length - 1];
      if (last?.kind === "let") {
        node.type = voidType();
        return node.type;
      }
      return result;
    }

    case "if": {
      resolveType(node.condition, scope);
      const thenType = resolveType(node.then, scope);
      const elseType = resolveType(node.elseBranch, scope);
      return widen(thenType, elseType);
    }

    case "loop": {
      for (const stmt of node.body) resolveType(stmt, scope);
      return dynamic();
    }

    case "while": {
      resolveType(node.condition, scope);
      for (const stmt of node.body) resolveType(stmt, scope);
      return dynamic();
    }

    case "break":
      return resolveType(node.value, scope);

    case "yield":
      return resolveType(node.value, scope);

    case "return":
      return resolveType(node.value, scope);

    case "continue":
      return dynamic();

    case "typealias": {
      const resolvedType = resolveTypeNode(node.type, scope);
      registerDeclaration(
        node.name,
        scope,
        { kind: "var", type: resolvedType, mutable: false },
        node.pos,
      );
      return resolvedType;
    }

    case "enum": {
      // Register enum as a type in the symbol table
      const enumType: Type = { kind: "enum", name: node.name, variant: "" };
      registerDeclaration(
        node.name,
        scope,
        { kind: "var", type: enumType, mutable: false },
        node.pos,
      );
      return enumType;
    }

    case "enum_access": {
      const decl = scope.declarations.get(node.enum);
      if (!decl || decl.kind !== "var" || decl.type.kind !== "enum") {
        throw new InterpreterError(
          "type",
          `Undefined enum: ${node.enum}`,
          node.pos,
        );
      }
      const enumType: Type = {
        kind: "enum",
        name: node.enum,
        variant: node.variant,
      };
      node.type = enumType;
      return enumType;
    }

    case "typecheck": {
      resolveType(node.value, scope);
      // Resolve the target type from unresolved placeholder
      node.type = resolveTypeNode(node.type, scope);
      // The result type is always bool().
      return bool();
    }
    case "fn": {
      // Check for duplicate param names
      const seenParams = new Set<string>();
      for (const param of node.params) {
        if (seenParams.has(param.name)) {
          throw new InterpreterError(
            "type",
            `Duplicate parameter: '${param.name}'`,
            node.pos,
          );
        }
        seenParams.add(param.name);
      }
      // Build type param scope for generic functions
      const fnScope: Scope = {
        declarations: scope.declarations,
        typeParams: node.typeParams
          ? new Map(node.typeParams.map((tp) => [tp, typeParam(tp)]))
          : scope.typeParams,
      };
      const bodyType = resolveType(node.body, fnScope);
      // Validate return type annotation if present
      if (node.returnType) {
        checkAssignable(
          bodyType,
          resolveTypeNode(node.returnType, fnScope),
          node.pos,
        );
      }
      registerDeclaration(
        node.name,
        scope,
        {
          kind: "fn",
          returnType: bodyType,
          params: node.params,
          typeParams: node.typeParams,
        },
        node.pos,
      );
      return dynamic();
    }
    case "struct": {
      const seen = new Set<string>();
      const resolvedFields: { name: string; type: Type }[] = [];
      for (const field of node.fields) {
        if (seen.has(field.name)) {
          throw new InterpreterError(
            "type",
            `Duplicate field '${field.name}' in struct '${node.name}'`,
            node.pos,
          );
        }
        seen.add(field.name);
        const fieldType = field.type
          ? resolveTypeNode(field.type, scope)
          : dynamic();
        resolvedFields.push({ name: field.name, type: fieldType });
      }
      const st = structType(node.name, resolvedFields);
      registerDeclaration(
        node.name,
        scope,
        { kind: "var", type: st, mutable: false },
        node.pos,
      );
      return st;
    }
    case "struct_instantiation": {
      const decl = scope.declarations.get(node.name);
      if (!decl || decl.kind !== "var" || !isStruct(decl.type)) {
        throw new InterpreterError(
          "type",
          `Undefined struct: ${node.name}`,
          node.pos,
        );
      }
      const structTypeDecl = decl.type;
      const fieldMap = new Map(
        structTypeDecl.fields.map((f) => [f.name, f.type]),
      );
      for (const field of node.fields) {
        const fieldType = resolveType(field.value, scope);
        const expectedType = fieldMap.get(field.name);
        if (!expectedType) {
          throw new InterpreterError(
            "type",
            `Unknown field '${field.name}' in struct '${node.name}'`,
            field.value.pos,
          );
        }
        checkAssignable(fieldType, expectedType, field.value.pos);
      }
      return structTypeDecl;
    }
    case "field_access": {
      const targetType = resolveType(node.target, scope);
      if (isStruct(targetType)) {
        const field = targetType.fields.find((f) => f.name === node.field);
        if (!field) {
          throw new InterpreterError(
            "type",
            `Unknown field '${node.field}' in struct '${targetType.name}'`,
            node.pos,
          );
        }
        node.type = field.type;
        return field.type;
      }
      return dynamic();
    }
    case "call": {
      const callee = node.callee as { kind: "identifier"; name: string };
      const decl = scope.declarations.get(callee.name);
      if (decl && decl.kind === "fn") {
        const params = decl.params;
        if (node.args.length !== params.length) {
          throw new InterpreterError(
            "type",
            `Function '${callee.name}' expects ${params.length} argument(s), got ${node.args.length}`,
            node.pos,
          );
        }
        // Build type param scope for generic function calls
        const callTypeParams = new Map<string, Type>();
        if (decl.typeParams) {
          for (let i = 0; i < decl.typeParams.length; i++) {
            const arg = node.args[i];
            if (arg) {
              const argType = resolveType(arg, scope);
              const tpName = decl.typeParams[i]!;
              callTypeParams.set(tpName, argType);
            }
          }
        }
        const callScope: Scope = {
          declarations: scope.declarations,
          typeParams:
            callTypeParams.size > 0 ? callTypeParams : scope.typeParams,
        };
        for (let i = 0; i < node.args.length; i++) {
          const arg = node.args[i];
          if (!arg) continue;
          const argType = resolveType(arg, scope);
          const param = params[i];
          if (param) {
            checkAssignable(
              argType,
              resolveTypeNode(param.type, callScope),
              arg.pos,
            );
          }
        }
        // Resolve return type with type param substitutions
        return resolveTypeNode(decl.returnType, callScope);
      }
      return dynamic();
    }
    case "match": {
      resolveType(node.target, scope);
      let resultType: Type = dynamic();
      for (const case_ of node.cases) {
        const bodyType = resolveType(case_.body, scope);
        resultType = widen(resultType, bodyType);
      }
      node.type = resultType;
      return resultType;
    }

    case "tuple": {
      const elementTypes: Type[] = [];
      for (const elem of node.elements) {
        const elemType = resolveType(elem, scope);
        elementTypes.push(elemType);
      }
      // Use declared type if present
      const resolvedDeclType = node.type
        ? resolveTypeNode(node.type, scope)
        : undefined;
      if (resolvedDeclType && resolvedDeclType.kind === "tuple") {
        // Context propagation: dynamic elements inherit from declared type
        for (let i = 0; i < node.elements.length; i++) {
          const declaredElem = resolvedDeclType.elements[i];
          const elemType = elementTypes[i]!;
          if (declaredElem && isDynamic(elemType) && !isDynamic(declaredElem)) {
            setNodeType(node.elements[i]!, declaredElem);
            elementTypes[i] = declaredElem;
          }
        }
      }
      node.type = { kind: "tuple", elements: elementTypes };
      return node.type;
    }

    case "tuple_access": {
      const targetType = resolveType(node.target, scope);
      if (targetType.kind === "tuple") {
        if (node.index < 0 || node.index >= targetType.elements.length) {
          throw new InterpreterError(
            "type",
            `Tuple index ${node.index} out of range (tuple has ${targetType.elements.length} elements)`,
            node.pos,
          );
        }
        const elemType = targetType.elements[node.index];
        node.type = elemType ?? dynamic();
        return node.type;
      }
      node.type = dynamic();
      return node.type;
    }
  }
}

/** Set type on a node if the node kind supports it. */
function setNodeType(node: AstNode, type: Type): void {
  switch (node.kind) {
    case "number":
    case "boolean":
    case "unary":
    case "identifier":
    case "tuple":
    case "tuple_access":
      node.type = type;
      break;
  }
}

/** Reject boolean operands for arithmetic operators. */
function checkNotBool(
  t: Type,
  op: string,
  pos?: { line: number; column: number },
): void {
  if (!isDynamic(t) && t.kind === "bool")
    throw new InterpreterError(
      "type",
      `Type mismatch: cannot use arithmetic operator '${op}' on ${typeName(t)}`,
      pos,
    );
}

/** Validate that a value type is assignable to a target type. */
function checkAssignable(
  valueType: Type,
  targetType: Type,
  pos?: { line: number; column: number },
): void {
  if (!isDynamic(valueType) && !isAssignable(valueType, targetType)) {
    throw new InterpreterError(
      "type",
      `Type mismatch: cannot assign ${typeName(valueType)} to ${typeName(targetType)}`,
      pos,
    );
  }
}

/** Resolve a user-defined type name from the scope. */
function resolveUserType(name: string, scope: Scope): Type | undefined {
  const decl = scope.declarations.get(name);
  if (decl && decl.kind === "var") {
    return decl.type;
  }
  return undefined;
}

/** Resolve an unresolved type placeholder to a concrete type. */
function resolveTypeNode(type: Type, scope?: Scope): Type {
  if (type.kind === "unresolved") {
    // Check type param scope first (for generic functions)
    if (scope?.typeParams?.has(type.name)) {
      return scope.typeParams.get(type.name)!;
    }
    // Check user-defined types first, then fall back to builtins
    if (scope) {
      const userType = resolveUserType(type.name, scope);
      if (userType) return userType;
    }
    return resolveBuiltinType(type.name);
  }
  if (type.kind === "pointer") {
    return pointer(resolveTypeNode(type.inner, scope), type.mutable);
  }
  if (type.kind === "array") {
    return arrayType(resolveTypeNode(type.inner, scope), type.length);
  }
  if (type.kind === "tuple") {
    return tupleType(type.elements.map((e) => resolveTypeNode(e, scope)));
  }
  if (type.kind === "union") {
    return unionType(type.variants.map((v) => resolveTypeNode(v, scope)));
  }
  return type;
}

/**
 * Analyze an AST: resolve types, validate compatibility, build symbol table.
 * Throws on semantic errors.
 */
export function analyze(ast: AstNode): void {
  const scope: Scope = { declarations: new Map() };
  resolveType(ast, scope);
}
