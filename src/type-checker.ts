import type { AstNode, LValue, TypeNode } from "./ast";
import { INT_TYPES, BUILTIN_TYPES, type IntTypeName } from "./types";
import type { Value } from "./environment";
import type { Environment } from "./environment";

/** Runtime type check: does `val` match `typeNode`? */
export function checkType(
  val: Value,
  typeNode: TypeNode,
  env: Environment,
  evaluate: (node: AstNode, env: Environment) => number,
  num: (v: number, numType?: IntTypeName, isFloat?: boolean) => Value,
): boolean {
  if (typeNode.kind === "name") {
    const alias = env.getTypeAlias(typeNode.name);
    if (alias) return checkType(val, alias, env, evaluate, num);
  }

  switch (typeNode.kind) {
    case "name": {
      const typeName = typeNode.name.toLowerCase();
      if (typeName === "bool") return val.kind === "bool";
      if (typeName === "char") return val.kind === "number" && !!val.isChar;
      if (val.kind === "number") {
        if (val.isFloat)
          return (
            val.numType === typeName ||
            (val.numType === undefined && typeName === "f32")
          );
        if (!val.numType) return typeName === "i32";
        return val.numType === typeName;
      }
      return false;
    }
    case "array": {
      if (val.kind !== "array") return false;
      const length = evaluate(typeNode.length, env);
      if (val.elements.length !== length) return false;
      for (const elem of val.elements) {
        if (!checkType(elem, typeNode.elementType, env, evaluate, num))
          return false;
      }
      return true;
    }
    case "ref": {
      if (val.kind !== "ref") return false;
      const refVal = env.get(val.ref.name);
      if (refVal === undefined) return false;
      return checkType(refVal, typeNode.innerType, env, evaluate, num);
    }
    case "struct": {
      if (val.kind !== "struct") return false;
      for (const field of typeNode.fields) {
        const fieldVal = val.fields[field.name];
        if (fieldVal === undefined) return false;
        if (!checkType(fieldVal, field.type, env, evaluate, num)) return false;
      }
      return true;
    }
    case "fn": {
      if (val.kind !== "fnref") return false;
      const fn = val.fn;
      if (fn.params.length !== typeNode.params.length) return false;
      for (let i = 0; i < fn.params.length; i++) {
        const paramType = typeNode.params[i];
        if (!paramType || !checkType(num(0), paramType, env, evaluate, num))
          return false;
      }
      return checkType(num(0), typeNode.returnType, env, evaluate, num);
    }
    case "union": {
      for (const t of typeNode.types) {
        if (checkType(val, t, env, evaluate, num)) return true;
      }
      return false;
    }
    case "tuple": {
      if (val.kind !== "tuple") return false;
      if (val.elements.length !== typeNode.elementTypes.length) return false;
      for (let i = 0; i < typeNode.elementTypes.length; i++) {
        const elem = val.elements[i];
        const elemType = typeNode.elementTypes[i];
        if (elem === undefined || elemType === undefined) return false;
        if (!checkType(elem, elemType, env, evaluate, num)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

/** Find an IntType by name, throwing if not found. */
function requireIntType(name: string): (typeof INT_TYPES)[number] {
  const t = INT_TYPES.find((t) => t.name === name);
  if (!t) throw new Error(`Unknown type: ${name}`);
  return t;
}

/** Scope tracks variable declarations, mutability, and function signatures. */
interface Scope {
  variables: Map<string, { mutable: boolean; type?: IntTypeName | string }>;
  functions: Map<
    string,
    { params: TypeNode[]; returnType: TypeNode; typeParams?: { name: string; constraint?: TypeNode }[] }
  >;
  typeAliases: Map<string, TypeNode>;
  structs: Map<string, TypeNode>;
  typeParams?: { name: string; constraint?: TypeNode }[];
  parent?: Scope;
}

function newScope(parent?: Scope): Scope {
  return {
    variables: new Map(),
    functions: new Map(),
    typeAliases: new Map(),
    structs: new Map(),
    typeParams: parent?.typeParams,
    parent,
  };
}

function getVar(
  scope: Scope,
  name: string,
): { mutable: boolean; type?: IntTypeName } | undefined {
  let s: Scope | undefined = scope;
  while (s) {
    const entry = s.variables.get(name);
    if (entry !== undefined) return entry;
    s = s.parent;
  }
  return undefined;
}

function getFn(
  scope: Scope,
  name: string,
): { params: TypeNode[]; returnType: TypeNode } | undefined {
  let s: Scope | undefined = scope;
  while (s) {
    const entry = s.functions.get(name);
    if (entry !== undefined) return entry;
    s = s.parent;
  }
  return undefined;
}

function getTypeAlias(scope: Scope, name: string): TypeNode | undefined {
  let s: Scope | undefined = scope;
  while (s) {
    const entry = s.typeAliases.get(name);
    if (entry !== undefined) return entry;
    s = s.parent;
  }
  return undefined;
}

function getStruct(scope: Scope, name: string): TypeNode | undefined {
  let s: Scope | undefined = scope;
  while (s) {
    const entry = s.structs.get(name);
    if (entry !== undefined) return entry;
    s = s.parent;
  }
  return undefined;
}

function checkAssignable(scope: Scope, name: string): void {
  const varInfo = getVar(scope, name);
  if (!varInfo) throw new Error(`Undefined variable: ${name}`);
  if (!varInfo.mutable)
    throw new Error(`Cannot assign to immutable variable: ${name}`);
}

function checkLValueAssignable(scope: Scope, lvalue: LValue): void {
  switch (lvalue.kind) {
    case "var":
      checkAssignable(scope, lvalue.name);
      break;
    default:
      checkLValueExists(scope, lvalue);
      break;
  }
}

function checkLValueExists(scope: Scope, lvalue: LValue): void {
  switch (lvalue.kind) {
    case "var":
      if (!getVar(scope, lvalue.name))
        throw new Error(`Undefined variable: ${lvalue.name}`);
      break;
    case "deref":
      checkLValueExists(scope, lvalue.ref);
      break;
    case "index":
      checkLValueExists(scope, lvalue.array);
      checkNode(lvalue.index, scope);
      break;
    case "field":
      checkLValueExists(scope, lvalue.struct);
      break;
  }
}

/** Validate type constraints on the AST. */
export function typeCheck(statements: AstNode[]): void {
  const scope = newScope();
  for (const stmt of statements) {
    checkNode(stmt, scope);
  }
}

/** Check that a literal value satisfies a type constraint. */
function checkConstraint(typeNode: TypeNode, valueNode: AstNode): void {
  if (typeNode.kind !== "name" || !typeNode.constraint) return;
  const { op, value } = typeNode.constraint;
  const literalVal = valueNode.type === "num" ? valueNode.value : null;
  if (literalVal === null) return;
  const passes =
    op === ">"
      ? literalVal > value
      : op === ">="
        ? literalVal >= value
        : op === "<"
          ? literalVal < value
          : op === "<="
            ? literalVal <= value
            : op === "=="
              ? literalVal === value
              : op === "!="
                ? literalVal !== value
                : false;
  if (!passes)
    throw new Error(
      `Value ${literalVal} does not satisfy constraint ${op} ${value}`,
    );
}

/** Check literal nodes. */
function checkLiteral(node: AstNode): void {
  switch (node.type) {
    case "num":
      if (node.numType) {
        if (!node.numType.startsWith("f")) {
          const t = requireIntType(node.numType);
          if (node.value < t.min || node.value > t.max)
            throw new Error(`${t.suffix} value out of range: ${node.value}`);
        }
      }
      break;
    case "char":
    case "bool":
    case "string":
    case "null":
      break;
  }
}

/** Check if a variable has an unconstrained generic type parameter type. */
function isUnconstrainedGenericType(type: string | undefined, scope: Scope): boolean {
  if (type === undefined) return false;
  const tp = scope.typeParams?.find(tp => tp.name === type);
  // Generic with no constraint = reject; generic with constraint = allow
  return tp !== undefined && tp.constraint === undefined;
}

/** Get the type of an expression (for binary operator checking). */
function getExprType(node: AstNode, scope: Scope): string | undefined {
  if (node.type === "id") {
    const varInfo = getVar(scope, node.name);
    return varInfo?.type;
  }
  return undefined;
}

/** Reject binary operators on unconstrained generic type parameters. */
function checkBinaryOpTypes(node: AstNode, scope: Scope): void {
  if (node.type !== "binop") return;
  if (node.op === "&&" || node.op === "||") return; // Logical ops always ok

  const leftType = getExprType(node.left, scope);
  const rightType = getExprType(node.right, scope);

  if (isUnconstrainedGenericType(leftType, scope) || isUnconstrainedGenericType(rightType, scope)) {
    throw new Error(
      `Cannot apply operator '${node.op}' to generic type parameter`,
    );
  }
}

/** Check operator nodes. */
function checkOperator(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "unop":
      if (node.op === "-") {
        const operand = node.operand;
        if (
          operand.type === "num" &&
          operand.numType &&
          !requireIntType(operand.numType).signed
        )
          throw new Error("Cannot negate unsigned integer");
        if (operand.type === "id") {
          const varInfo = getVar(scope, operand.name);
          if (varInfo?.type && !requireIntType(varInfo.type).signed)
            throw new Error("Cannot negate unsigned integer");
        }
      }
      checkNode(node.operand, scope);
      break;
    case "binop":
      checkNode(node.left, scope);
      checkNode(node.right, scope);
      // Reject binary operators on generic type parameters
      checkBinaryOpTypes(node, scope);
      break;
  }
}

/** Check declaration nodes. */
function checkDeclaration(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "let": {
      const valueType =
        node.value.type === "num" && node.value.numType
          ? node.value.numType
          : undefined;
      const declaredType = node.typeAnnotation;
      if (declaredType) {
        if (declaredType.kind === "union") {
          // Union type — no range checking needed
        } else if (declaredType.kind === "name") {
          // Generic type parameter — skip range checking
          if (scope.typeParams?.some(tp => tp.name === declaredType.name)) {
            // skip
          } else {
            const structType = getStruct(scope, declaredType.name);
            if (structType) {
              // Struct types don't need range checking
            } else if (declaredType.name === "Null") {
              // Null type — no range checking needed
            } else {
              const alias = getTypeAlias(scope, declaredType.name);
              let typeName = declaredType.name;
              if (alias && alias.kind === "name") {
                typeName = alias.name;
              }
              const target = requireIntType(
                typeName.toLowerCase() as IntTypeName,
              );
              const source = valueType ? requireIntType(valueType) : null;
              if (source && target.max < source.max)
                throw new Error(
                  `Cannot assign ${source.suffix} to ${target.suffix}`,
                );
              checkConstraint(declaredType, node.value);
            }
          }
        }
      }
      scope.variables.set(node.name, {
        mutable: node.mutable,
        type:
          declaredType?.kind === "name"
            ? (declaredType.name.toLowerCase() as IntTypeName)
            : valueType,
      });
      checkNode(node.value, scope);
      break;
    }
    case "assign":
    case "compoundassign": {
      checkLValueAssignable(scope, node.lvalue);
      checkNode(node.value, scope);
      break;
    }
  }
}

/** Check reference nodes. */
function checkReference(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "id": {
      if (!getVar(scope, node.name)) {
        if (BUILTIN_TYPES.includes(node.name.toLowerCase())) break;
        throw new Error(`Undefined variable: ${node.name}`);
      }
      break;
    }
    case "ref": {
      const varInfo = getVar(scope, node.name);
      if (!varInfo) {
        if (!getFn(scope, node.name))
          throw new Error(`Undefined: ${node.name}`);
      }
      break;
    }
    case "fnref": {
      if (!getFn(scope, node.name))
        throw new Error(`Undefined function: ${node.name}`);
      break;
    }
  }
}

/** Check function nodes. */
function checkFunction(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "fn-def": {
      const paramTypes = node.params.map((p) => p.type);
      scope.functions.set(node.name, {
        params: paramTypes,
        returnType: node.returnType,
        typeParams: node.typeParams,
      });
      // Void functions must have a block body, not a value expression
      if (node.returnType.kind === "name" && node.returnType.name === "Void") {
        if (node.body.type !== "block")
          throw new Error("Void function body must be a block");
      }
      const fnScope = newScope(scope);
      if (node.typeParams) {
        fnScope.typeParams = node.typeParams;
      }
      for (const param of node.params) {
        // Store generic type param name as the type (e.g. "T") so operators can reject it
        // If the type param has a constraint, store the constraint type instead
        const paramName = param.type.kind === "name" ? param.type.name : undefined;
        const varType =
          paramName !== undefined &&
          node.typeParams?.some(tp => tp.name === paramName)
            ? paramName
            : undefined;
        fnScope.variables.set(param.name, { mutable: false, type: varType });
      }
      checkNode(node.body, fnScope);
      break;
    }
    case "fn-call": {
      const fnInfo = getFn(scope, node.name);
      if (!fnInfo) {
        const varInfo = getVar(scope, node.name);
        if (!varInfo) throw new Error(`Undefined function: ${node.name}`);
      }
      for (const arg of node.args) {
        checkNode(arg, scope);
      }
      break;
    }
  }
}

/** Check control flow nodes. */
function checkControlFlow(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "if-statement":
    case "if-expression":
      checkNode(node.condition, scope);
      checkNode(node.thenBranch, scope);
      checkNode(node.elseBranch, scope);
      break;
    case "while-loop":
      checkNode(node.condition, scope);
      checkNode(node.body, scope);
      break;
    case "for-loop": {
      checkNode(node.iterable, scope);
      const childScope = newScope(scope);
      childScope.variables.set(node.variable, { mutable: false });
      checkNode(node.body, childScope);
      break;
    }
    case "block": {
      const childScope = newScope(scope);
      for (const stmt of node.statements) {
        checkNode(stmt, childScope);
      }
      break;
    }
    case "break":
    case "continue":
      break;
  }
}

/** Check collection nodes. */
function checkCollection(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "range":
      checkNode(node.start, scope);
      checkNode(node.end, scope);
      break;
    case "array-literal":
      for (const el of node.elements) {
        checkNode(el, scope);
      }
      break;
    case "array-index":
      checkNode(node.array, scope);
      checkNode(node.index, scope);
      break;
    case "struct-literal":
      for (const f of node.fields) {
        checkNode(f.value, scope);
      }
      break;
    case "struct-access":
      checkNode(node.struct, scope);
      break;
  }
}

/** Check type operation nodes. */
function checkTypeOp(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "type-check":
      checkNode(node.operand, scope);
      break;
    case "type-alias":
      scope.typeAliases.set(node.name, node.typeNode);
      break;
    case "struct-def":
      scope.structs.set(node.name, {
        kind: "struct",
        fields: node.fields,
      });
      break;
    case "cast":
      checkNode(node.expression, scope);
      break;
    case "deref":
      checkNode(node.operand, scope);
      break;
  }
}

function checkNode(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "num":
    case "char":
    case "bool":
      checkLiteral(node);
      return;
    case "unop":
    case "binop":
      checkOperator(node, scope);
      return;
    case "let":
    case "assign":
    case "compoundassign":
      checkDeclaration(node, scope);
      return;
    case "id":
    case "ref":
    case "fnref":
      checkReference(node, scope);
      return;
    case "fn-def":
    case "fn-call":
      checkFunction(node, scope);
      return;
    case "if-statement":
    case "if-expression":
    case "while-loop":
    case "for-loop":
    case "block":
    case "break":
    case "continue":
      checkControlFlow(node, scope);
      return;
    case "range":
    case "array-literal":
    case "array-index":
    case "struct-literal":
    case "struct-access":
      checkCollection(node, scope);
      return;
    case "type-check":
    case "type-alias":
    case "struct-def":
    case "cast":
    case "deref":
      checkTypeOp(node, scope);
      return;
  }
}
