import type {
  Expr,
  Statement,
  BinaryExpr,
  CallExpr,
  StructLiteral,
  FieldAccess,
  RefExpr,
  DerefExpr,
  UnaryExpr,
  NumberLiteral,
  BooleanLiteral,
  StringLiteral,
  ArrayLiteral,
  IndexAccess,
  LengthAccess,
  ClosureExpr,
  BlockExpr,
} from "./ast";
import type { Scope } from "./scope";
import { TypeError } from "./errors";
import type { Position } from "./errors";
import type { Type } from "./types";
import { typeEquals, isRefType, isNarrower, typeToString } from "./types";

export function inferExprType(node: Expr, scopes: Scope[]): Type | null {
  if (isLiteral(node)) return inferLiteralType(node);
  if (isSimpleExpr(node)) return inferSimpleExprType(node, scopes);
  return inferComplexExprType(node, scopes);
}

function isLiteral(
  node: Expr,
): node is NumberLiteral | BooleanLiteral | StringLiteral {
  return (
    node.type === "NumberLiteral" ||
    node.type === "BooleanLiteral" ||
    node.type === "StringLiteral"
  );
}

function inferLiteralType(
  node: NumberLiteral | BooleanLiteral | StringLiteral,
): Type | null {
  if (node.type === "NumberLiteral") return node.typeAnnotation;
  if (node.type === "StringLiteral") return { kind: "str" };
  return { kind: "bool" };
}

function isSimpleExpr(node: Expr): node is Identifier | BinaryExpr | CallExpr {
  return (
    node.type === "Identifier" ||
    node.type === "BinaryExpr" ||
    node.type === "CallExpr"
  );
}

function inferComplexExprType(
  node:
    | StructLiteral
    | FieldAccess
    | RefExpr
    | DerefExpr
    | UnaryExpr
    | ArrayLiteral
    | IndexAccess
    | LengthAccess
    | ClosureExpr
    | BlockExpr,
  scopes: Scope[],
): Type | null {
  if (node.type === "StructLiteral")
    return inferStructLiteralType(node, scopes);
  if (node.type === "FieldAccess") return inferFieldAccessType(node, scopes);
  if (node.type === "RefExpr") return inferRefType(node, scopes);
  if (node.type === "DerefExpr") return inferDerefType(node, scopes);
  if (node.type === "ArrayLiteral") return inferArrayLiteralType(node, scopes);
  if (node.type === "IndexAccess") return inferIndexAccessType(node, scopes);
  if (node.type === "LengthAccess") return inferLengthAccessType(node, scopes);
  if (node.type === "ClosureExpr") return inferClosureType(node, scopes);
  if (node.type === "BlockExpr") return inferBlockExprType(node, scopes);
  return inferUnaryType(node, scopes);
}

function inferBlockExprType(node: BlockExpr, scopes: Scope[]): Type | null {
  if (node.body.length === 0) return null;
  const lastStmt = node.body[node.body.length - 1]!;
  return inferStatementType(lastStmt, scopes);
}

function inferStatementType(node: Statement, scopes: Scope[]): Type | null {
  if (node.type === "ExprStatement")
    return inferExprType(node.expression, scopes);
  return null;
}

function inferClosureType(node: ClosureExpr, scopes: Scope[]): Type | null {
  const paramTypes: Type[] = [];
  for (const param of node.params) {
    paramTypes.push(param.typeAnnotation ?? { kind: "i32" });
  }
  // Create a temporary scope with closure params for body type inference
  const tempScope: Scope = {
    env: {},
    mutable: new Set(),
    types: {},
    functions: {},
    functionReturnTypes: {},
    structs: {},
  };
  for (let i = 0; i < node.params.length; i++) {
    const param = node.params[i]!;
    tempScope.types[param.name] = param.typeAnnotation ?? { kind: "i32" };
  }
  const extendedScopes = [...scopes, tempScope];
  const returnType = inferExprType(node.body, extendedScopes) ?? {
    kind: "i32",
  };
  return { kind: "closure", paramTypes, returnType };
}

function inferArrayLiteralType(
  node: ArrayLiteral,
  scopes: Scope[],
): Type | null {
  if (node.elements.length === 0) return null;
  const elemType = inferExprType(node.elements[0], scopes);
  // Infer common type from all elements
  for (let i = 1; i < node.elements.length; i++) {
    const t = inferExprType(node.elements[i]!, scopes);
    if (t && elemType && !typeEquals(t, elemType)) {
      // Mixed types, return null (untyped)
      return null;
    }
  }
  return {
    kind: "array",
    elementType: elemType ?? { kind: "i32" },
    size: node.elements.length,
  };
}

function inferIndexAccessType(node: IndexAccess, scopes: Scope[]): Type | null {
  const objType = inferExprType(node.object, scopes);
  if (objType && objType.kind === "array") {
    return objType.elementType;
  }
  return null;
}

function inferLengthAccessType(_node: LengthAccess): Type | null {
  void _node;
  return { kind: "i32" };
}

function inferSimpleExprType(
  node: Identifier | BinaryExpr | CallExpr,
  scopes: Scope[],
): Type | null {
  if (node.type === "Identifier") return lookupType(node.name, scopes);
  if (node.type === "BinaryExpr") return inferBinaryType(node, scopes);
  return inferCallType(node, scopes);
}

function inferUnaryType(node: UnaryExpr, scopes: Scope[]): Type | null {
  const operandType = inferExprType(node.operand, scopes);
  // Unary minus returns I32 if operand is untyped
  if (operandType === null) return { kind: "i32" };
  // If operand is a numeric type, return the corresponding signed type
  if (operandType.kind === "uint") {
    return { kind: "signed", bits: operandType.bits };
  }
  if (operandType.kind === "signed") {
    return operandType;
  }
  if (operandType.kind === "i32") return operandType;
  return { kind: "i32" };
}

function inferRefType(node: RefExpr, scopes: Scope[]): Type | null {
  const innerType = inferExprType(node.operand, scopes);
  if (innerType === null) return null;
  return { kind: "ref", inner: innerType, mutable: node.mutable };
}

export function inferDerefType(node: DerefExpr, scopes: Scope[]): Type | null {
  const refType = inferExprType(node.operand, scopes);
  if (refType && isRefType(refType)) {
    return refType.inner;
  }
  return refType;
}

function inferCallType(node: CallExpr, scopes: Scope[]): Type | null {
  // Check if the callee is a closure stored in a variable
  const calleeType = lookupType(node.name, scopes);
  if (calleeType && calleeType.kind === "closure") {
    return calleeType.returnType;
  }
  const returnType = lookupFunctionReturnType(node.name, scopes);
  if (returnType !== null) return returnType;
  const funcInfo = lookupFunctionInfo(node.name, scopes);
  return funcInfo ? inferExprType(funcInfo.body, scopes) : null;
}

export function lookupFunctionInfo(
  name: string,
  scopes: Scope[],
): {
  body: Expr;
  params: { name: string; typeAnnotation: Type | null }[];
} | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope.functions) return scope.functions[name]!;
  }
  return null;
}

function lookupFunctionReturnType(name: string, scopes: Scope[]): Type | null {
  return lookupInScopes(scopes, "functionReturnTypes", name);
}

function lookupInScopes(
  scopes: Scope[],
  prop: keyof Scope,
  name: string,
): Type | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope[prop])
      return (scope[prop] as Record<string, Type | null>)[name] ?? null;
  }
  return null;
}

function inferBinaryType(node: BinaryExpr, scopes: Scope[]): Type | null {
  const leftType = inferExprType(node.left, scopes);
  const rightType = inferExprType(node.right, scopes);
  if (isArithmeticOp(node.op)) {
    checkNoStringArithmetic(leftType, node.left.pos);
    checkNoStringArithmetic(rightType, node.right.pos);
    return leftType ?? rightType;
  }
  if (isComparisonOp(node.op)) {
    checkStringComparison(leftType, rightType, node.left.pos, node.right.pos);
    return { kind: "bool" };
  }
  return null;
}

function checkNoStringArithmetic(ty: Type | null, pos?: Position): void {
  if (ty && ty.kind === "str") {
    throw new TypeError(
      `strings cannot be used with arithmetic operators`,
      pos,
    );
  }
}

function checkStringComparison(
  leftType: Type | null,
  rightType: Type | null,
  leftPos?: Position,
  rightPos?: Position,
): void {
  if (leftType && leftType.kind === "str") {
    if (rightType && rightType.kind !== "str")
      throw new TypeError(
        `type mismatch: cannot compare &Str with ${typeToString(rightType)}`,
        rightPos,
      );
    return;
  }
  if (rightType && rightType.kind === "str") {
    if (leftType && leftType.kind !== "str")
      throw new TypeError(
        `type mismatch: cannot compare ${typeToString(leftType)} with &Str`,
        leftPos,
      );
  }
}

function isArithmeticOp(op: string): boolean {
  return op === "+" || op === "-" || op === "*" || op === "/";
}

function isComparisonOp(op: string): boolean {
  return (
    op === "<" ||
    op === ">" ||
    op === "<=" ||
    op === ">=" ||
    op === "==" ||
    op === "!="
  );
}

export function lookupType(name: string, scopes: Scope[]): Type | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope.types) return scope.types[name] ?? null;
  }
  return null;
}

export function checkTypeCompatibility(
  srcType: Type | null,
  dstType: Type | null,
  loc?: Position,
): void {
  if (dstType === null) return;
  if (srcType === null) return;
  if (typeEquals(srcType, dstType)) return;
  if (isRefType(srcType) && isRefType(dstType)) {
    checkRefTypeCompatibility(srcType, dstType, loc);
    return;
  }
  if (isNarrower(srcType, dstType)) return;
  if (isI32ToSignedWiden(srcType, dstType)) return;
  if (isArrayToArrays(srcType, dstType)) {
    checkArrayCompatibility(srcType, dstType, loc);
    return;
  }
  if (isStringIncompatible(srcType, dstType)) {
    throwTypeError(srcType, dstType, loc);
  }
  throwTypeError(srcType, dstType, loc);
}

function isStringIncompatible(src: Type, dst: Type): boolean {
  return src.kind === "str" || dst.kind === "str";
}

function throwTypeError(src: Type, dst: Type, loc?: Position): never {
  throw new TypeError(
    `type mismatch: cannot assign ${typeToString(src)} to ${typeToString(dst)}`,
    loc,
  );
}

function isI32ToSignedWiden(src: Type, dst: Type): boolean {
  return src.kind === "i32" && dst.kind === "signed";
}

function isArrayToArrays(src: Type, dst: Type): boolean {
  return src.kind === "array" && dst.kind === "array";
}

function checkArrayCompatibility(src: Type, dst: Type, loc?: Position): void {
  if (src.kind !== "array" || dst.kind !== "array") return;
  if (src.size !== dst.size) {
    throw new TypeError(
      `type mismatch: array size ${src.size} does not match ${dst.size}`,
      loc,
    );
  }
  checkTypeCompatibility(src.elementType, dst.elementType, loc);
}

function checkRefTypeCompatibility(
  srcRefType: Type,
  dstRefType: Type,
  loc?: Position,
): void {
  if (!isRefType(srcRefType) || !isRefType(dstRefType)) return;
  const srcInner = srcRefType.inner;
  const dstInner = dstRefType.inner;
  const srcMutable = srcRefType.mutable;
  const dstMutable = dstRefType.mutable;
  if (!typeEquals(srcInner, dstInner) || srcMutable !== dstMutable) {
    throw new TypeError(
      `type mismatch: cannot assign ${typeToString(srcRefType)} to ${typeToString(dstRefType)}`,
      loc,
    );
  }
}

export function inferStructLiteralType(
  node: StructLiteral,
  scopes: Scope[],
): Type | null {
  const scope = scopes[scopes.length - 1]!;
  return node.structName in scope.structs
    ? { kind: "struct", name: node.structName }
    : null;
}

export function inferFieldAccessType(
  node: FieldAccess,
  scopes: Scope[],
): Type | null {
  const objType = inferExprType(node.object, scopes);
  if (objType === null) return null;
  const scope = scopes[scopes.length - 1]!;
  const structName = isRefType(objType)
    ? typeToString(objType.inner)
    : typeToString(objType);
  const fields = scope.structs[structName];
  if (fields) {
    const field = fields.find((f) => f.name === node.field);
    return field ? field.typeAnnotation : null;
  }
  return null;
}

export function validateTypeRange(
  value: number,
  typeAnn: Type | null,
  loc?: Position,
): void {
  if (typeAnn === null) return;
  if (typeAnn.kind === "uint") validateUintRange(value, typeAnn, loc);
  if (typeAnn.kind === "signed") validateSignedRange(value, typeAnn, loc);
}

function validateUintRange(
  value: number,
  typeAnn: { bits: 8 | 16 | 32 | 64 },
  loc?: Position,
): void {
  const maxVal =
    typeAnn.bits === 64 ? Number.MAX_SAFE_INTEGER + 1 : (1 << typeAnn.bits) - 1;
  if (value < 0 || value > maxVal) {
    throw new TypeError(
      `value ${value} out of range for U${typeAnn.bits} (0-${maxVal})`,
      loc,
    );
  }
}

function validateSignedRange(
  value: number,
  typeAnn: { bits: 8 | 16 | 32 | 64 },
  loc?: Position,
): void {
  const bits = typeAnn.bits;
  const maxVal =
    bits === 64 ? Number.MAX_SAFE_INTEGER + 1 : (1 << (bits - 1)) - 1;
  const minVal =
    bits === 64 ? -(Number.MAX_SAFE_INTEGER + 1) : -(1 << (bits - 1));
  if (value < minVal || value > maxVal) {
    throw new TypeError(
      `value ${value} out of range for I${bits} (${minVal}-${maxVal})`,
      loc,
    );
  }
}
