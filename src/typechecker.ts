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

export function inferExprType(node: Expr, scopes: Scope[]): string | null {
  switch (node.type) {
    case "NumberLiteral":
      return node.typeAnnotation;
    case "BooleanLiteral":
      return "Bool";
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

export function inferRefType(node: RefExpr, scopes: Scope[]): string | null {
  const innerType = inferExprType(node.operand, scopes);
  if (innerType === null) return null;
  return node.mutable ? `&mut ${innerType}` : `&${innerType}`;
}

export function inferDerefType(node: DerefExpr, scopes: Scope[]): string | null {
  const refType = inferExprType(node.operand, scopes);
  if (refType && refType.startsWith("&")) {
    return refType.replace(/^&mut /, "").replace(/^&/, "");
  }
  return refType;
}

function inferCallType(node: CallExpr, scopes: Scope[]): string | null {
  const returnType = lookupFunctionReturnType(node.name, scopes);
  if (returnType !== null) return returnType;
  const funcInfo = lookupFunctionInfo(node.name, scopes);
  return funcInfo ? inferExprType(funcInfo.body, scopes) : null;
}

export function lookupFunctionInfo(
  name: string,
  scopes: Scope[],
): { body: Expr; params: { name: string; typeAnnotation: string | null }[] } | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope.functions) return scope.functions[name]!;
  }
  return null;
}

function lookupFunctionReturnType(
  name: string,
  scopes: Scope[],
): string | null {
  return lookupInScopes(scopes, "functionReturnTypes", name);
}

function lookupInScopes(
  scopes: Scope[],
  prop: keyof Scope,
  name: string,
): string | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope[prop])
      return (scope[prop] as Record<string, string | null>)[name] ?? null;
  }
  return null;
}

function inferBinaryType(node: BinaryExpr, scopes: Scope[]): string | null {
  const leftType = inferExprType(node.left, scopes);
  const rightType = inferExprType(node.right, scopes);
  if (isArithmeticOp(node.op)) return leftType ?? rightType;
  if (isComparisonOp(node.op)) return "Bool";
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

export function lookupType(name: string, scopes: Scope[]): string | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope.types) return scope.types[name] ?? null;
  }
  return null;
}

export function checkTypeCompatibility(
  srcType: string | null,
  dstType: string | null,
): void {
  if (dstType === null) return;
  if (srcType === null) return;
  if (srcType === dstType) return;
  if (isRefType(srcType) && isRefType(dstType)) {
    checkRefTypeCompatibility(srcType, dstType);
    return;
  }
  if (isNarrower(srcType, dstType)) return;
  throw new TypeError(`type mismatch: cannot assign ${srcType} to ${dstType}`);
}

function isRefType(typeName: string): boolean {
  return typeName.startsWith("&");
}

function checkRefTypeCompatibility(
  srcRefType: string,
  dstRefType: string,
): void {
  const srcInner = srcRefType.replace(/^&mut /, "").replace(/^&/, "");
  const dstInner = dstRefType.replace(/^&mut /, "").replace(/^&/, "");
  const srcMutable = srcRefType.startsWith("&mut");
  const dstMutable = dstRefType.startsWith("&mut");
  if (srcInner !== dstInner || srcMutable !== dstMutable) {
    throw new TypeError(
      `type mismatch: cannot assign ${srcRefType} to ${dstRefType}`,
    );
  }
}

function isNarrower(src: string, dst: string): boolean {
  const srcBits = parseTypeBits(src);
  const dstBits = parseTypeBits(dst);
  return srcBits !== null && dstBits !== null && srcBits < dstBits;
}

function parseTypeBits(typeName: string): number | null {
  const match = typeName.match(/^U(\d+)$/);
  return match ? parseInt(match[1]!, 10) : null;
}

export function inferStructLiteralType(
  node: StructLiteral,
  scopes: Scope[],
): string | null {
  const scope = scopes[scopes.length - 1]!;
  return node.structName in scope.structs ? node.structName : null;
}

export function inferFieldAccessType(
  node: FieldAccess,
  scopes: Scope[],
): string | null {
  const objType = inferExprType(node.object, scopes);
  if (objType === null) return null;
  const scope = scopes[scopes.length - 1]!;
  const fields = scope.structs[objType];
  if (fields) {
    const field = fields.find((f) => f.name === node.field);
    return field ? field.typeAnnotation : null;
  }
  return null;
}

export function validateTypeRange(value: number, typeAnn: string | null): void {
  if (typeAnn === null) return;
  validateUnsigned(value, typeAnn);
}

function validateUnsigned(value: number, typeAnn: string): void {
  if (typeAnn === "U8" && (value < 0 || value > 255)) {
    throw new TypeError(`value ${value} out of range for U8 (0-255)`);
  }
  if (typeAnn === "U16" && (value < 0 || value > 65535)) {
    throw new TypeError(`value ${value} out of range for U16 (0-65535)`);
  }
  if (typeAnn === "U32" && (value < 0 || value > 4294967295)) {
    throw new TypeError(`value ${value} out of range for U32 (0-4294967295)`);
  }
}
