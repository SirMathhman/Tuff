import type { AstNode, Lhs, TypeNode } from "./ast";
import { INT_TYPES, type IntTypeName } from "./types";

/** Find an IntType by name, throwing if not found. */
function requireIntType(name: string): (typeof INT_TYPES)[number] {
  const t = INT_TYPES.find((t) => t.name === name);
  if (!t) throw new Error(`Unknown type: ${name}`);
  return t;
}

/** Scope tracks variable declarations, mutability, and function signatures. */
interface Scope {
  variables: Map<string, { mutable: boolean; type?: IntTypeName }>;
  functions: Map<string, { params: TypeNode[]; returnType: TypeNode }>;
  typeAliases: Map<string, TypeNode>;
  structs: Map<string, TypeNode>;
  parent?: Scope;
}

function newScope(parent?: Scope): Scope {
  return {
    variables: new Map(),
    functions: new Map(),
    typeAliases: new Map(),
    structs: new Map(),
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

function checkLhsAssignable(scope: Scope, lhs: Lhs): void {
  switch (lhs.kind) {
    case "var":
      checkAssignable(scope, lhs.name);
      break;
    default:
      checkLhsExists(scope, lhs);
      break;
  }
}

function checkLhsExists(scope: Scope, lhs: Lhs): void {
  switch (lhs.kind) {
    case "var":
      if (!getVar(scope, lhs.name))
        throw new Error(`Undefined variable: ${lhs.name}`);
      break;
    case "deref":
      checkLhsExists(scope, lhs.ref);
      break;
    case "index":
      checkLhsExists(scope, lhs.array);
      checkNode(lhs.index, scope);
      break;
    case "field":
      checkLhsExists(scope, lhs.struct);
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

function checkNode(node: AstNode, scope: Scope): void {
  switch (node.type) {
    case "num":
      if (node.numType) {
        const t = requireIntType(node.numType);
        if (node.value < t.min || node.value > t.max)
          throw new Error(`${t.suffix} value out of range: ${node.value}`);
      }
      break;

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
      break;

    case "let": {
      const valueType =
        node.value.type === "num" && node.value.numType
          ? node.value.numType
          : undefined;
      const declaredType = node.typeAnnotation || valueType;
      if (declaredType) {
        // Check if it's a struct type
        const structType = getStruct(scope, declaredType);
        if (structType) {
          // Struct types don't need range checking
        } else {
          // Check if it's a type alias
          const alias = getTypeAlias(scope, declaredType);
          let typeName = declaredType;
          if (alias && alias.kind === "name") {
            typeName = alias.name;
          }
          const target = requireIntType(typeName.toLowerCase() as IntTypeName);
          const source = valueType ? requireIntType(valueType) : null;
          if (source && target.max < source.max)
            throw new Error(
              `Cannot assign ${source.suffix} to ${target.suffix}`,
            );
        }
      }
      scope.variables.set(node.name, {
        mutable: node.mutable,
        type: declaredType,
      });
      checkNode(node.value, scope);
      break;
    }

    case "assign":
    case "compoundassign": {
      checkLhsAssignable(scope, node.lhs);
      checkNode(node.value, scope);
      break;
    }

    case "id": {
      if (!getVar(scope, node.name))
        throw new Error(`Undefined variable: ${node.name}`);
      break;
    }

    case "ref": {
      const varInfo = getVar(scope, node.name);
      if (!varInfo) {
        // Could be a function reference — check functions
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

    case "fn-def": {
      const paramTypes = node.params.map((p) => p.type);
      scope.functions.set(node.name, {
        params: paramTypes,
        returnType: node.returnType,
      });
      const fnScope = newScope(scope);
      for (const param of node.params) {
        fnScope.variables.set(param.name, { mutable: false, type: undefined });
      }
      checkNode(node.body, fnScope);
      break;
    }

    case "fn-call": {
      const fnInfo = getFn(scope, node.name);
      if (!fnInfo) {
        // Could be a variable holding a function reference
        const varInfo = getVar(scope, node.name);
        if (!varInfo) throw new Error(`Undefined function: ${node.name}`);
      }
      for (const arg of node.args) {
        checkNode(arg, scope);
      }
      break;
    }

    case "block": {
      const childScope = newScope(scope);
      for (const stmt of node.statements) {
        checkNode(stmt, childScope);
      }
      break;
    }

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
      checkNode(node.range, scope);
      const childScope = newScope(scope);
      childScope.variables.set(node.variable, { mutable: false });
      checkNode(node.body, childScope);
      break;
    }

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

    case "break":
    case "continue":
    case "bool":
      break;
  }
}
