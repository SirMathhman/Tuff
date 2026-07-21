import type {
  Expr,
  BinaryExpr,
  CallExpr,
  StructLiteral,
  FieldAccess,
  RefExpr,
  DerefExpr,
} from "./ast";
import type { Scope } from "./scope";
import { TypeError } from "./errors";
import type { Position } from "./errors";
import type { Type } from "./types";
import { typeEquals, isRefType, isNarrower, typeToString } from "./types";

export function inferExprType(node: Expr, scopes: Scope[]): Type | null {
  switch (node.type) {
    case "NumberLiteral":
      return node.typeAnnotation;
    case "BooleanLiteral":
      return { kind: "bool" };
    case "Identifier":
      return lookupType(node.name, scopes);
    case "BinaryExpr":
      return inferBinaryType(node, scopes);
    case "CallExpr":
      return inferCallType(node, scopes);
    case "StructLiteral":
      return inferStructLiteralType(node, scopes);
    case "FieldAccess":
      return inferFieldAccessType(node, scopes);
    case "RefExpr":
      return inferRefType(node, scopes);
    case "DerefExpr":
      return inferDerefType(node, scopes);
  }
}

export function inferRefType(node: RefExpr, scopes: Scope[]): Type | null {
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
  if (isArithmeticOp(node.op)) return leftType ?? rightType;
  if (isComparisonOp(node.op)) return { kind: "bool" };
  return null;
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
  throw new TypeError(
    `type mismatch: cannot assign ${typeToString(srcType)} to ${typeToString(dstType)}`,
    loc,
  );
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
  if (typeAnn.kind === "uint") {
    const bits = typeAnn.bits;
    const maxVal = (1 << bits) - 1;
    if (value < 0 || value > maxVal) {
      throw new TypeError(
        `value ${value} out of range for U${bits} (0-${maxVal})`,
        loc,
      );
    }
  }
}
