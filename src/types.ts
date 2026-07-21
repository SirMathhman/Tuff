// ── Type AST ────────────────────────────────────────────────────────────────

export type Type =
  | UintType
  | SignedType
  | BoolType
  | I32Type
  | RefType
  | StructType
  | ArrayType
  | ClosureType;

export interface ClosureType {
  kind: "closure";
  paramTypes: Type[];
  returnType: Type;
}

export interface UintType {
  kind: "uint";
  bits: 8 | 16 | 32 | 64;
}

export interface SignedType {
  kind: "signed";
  bits: 8 | 16 | 32 | 64;
}

export interface BoolType {
  kind: "bool";
}

export interface I32Type {
  kind: "i32";
}

export interface RefType {
  kind: "ref";
  mutable: boolean;
  inner: Type;
}

export interface StructType {
  kind: "struct";
  name: string;
}

export interface ArrayType {
  kind: "array";
  elementType: Type;
  size: number;
}

// ── Type Helpers ────────────────────────────────────────────────────────────

export function typeToString(type: Type): string {
  switch (type.kind) {
    case "uint":
      return `U${type.bits}`;
    case "signed":
      return `I${type.bits}`;
    case "bool":
      return "Bool";
    case "i32":
      return "I32";
    case "ref":
      return type.mutable
        ? `&mut ${typeToString(type.inner)}`
        : `&${typeToString(type.inner)}`;
    case "struct":
      return type.name;
    case "array":
      return `[${typeToString(type.elementType)}; ${type.size}]`;
    case "closure":
      return `(${type.paramTypes.map(typeToString).join(", ")}) => ${typeToString(type.returnType)}`;
    default:
      return "unknown";
  }
}

export function parseTypeString(str: string): Type | null {
  if (str === "Bool") return { kind: "bool" };
  if (str === "I32") return { kind: "i32" };
  const uintMatch = str.match(/^U(8|16|32|64)$/);
  if (uintMatch) return parseUintType(uintMatch[1]!);
  const signedMatch = str.match(/^I(8|16|32|64)$/);
  if (signedMatch) return parseSignedType(signedMatch[1]!);
  const refMatch = str.match(/^&mut (.+)$/);
  if (refMatch) return tryParseRef(refMatch[1]!, true);
  const refMatch2 = str.match(/^&(.+)$/);
  if (refMatch2) return tryParseRef(refMatch2[1]!, false);
  // Array type: [Type; N]
  const arrayMatch = str.match(/^\[(.+);\s*(\d+)\]$/);
  if (arrayMatch) return tryParseArray(arrayMatch[1]!, arrayMatch[2]!);
  // Treat as struct type
  return { kind: "struct", name: str };
}

function tryParseRef(innerStr: string, mutable: boolean): Type | null {
  const inner = parseTypeString(innerStr);
  if (inner) return parseRefType(inner, mutable);
  return null;
}

function tryParseArray(elemStr: string, sizeStr: string): Type | null {
  const elemType = parseTypeString(elemStr);
  if (elemType) return parseArrayType(elemType, sizeStr);
  return null;
}

function parseRefType(inner: Type, mutable: boolean): Type {
  return { kind: "ref", mutable, inner };
}

function parseArrayType(elemType: Type, sizeStr: string): Type {
  return {
    kind: "array",
    elementType: elemType,
    size: parseInt(sizeStr, 10),
  };
}

function parseUintType(bitsStr: string): Type {
  return {
    kind: "uint",
    bits: parseInt(bitsStr, 10) as 8 | 16 | 32 | 64,
  };
}

function parseSignedType(bitsStr: string): Type {
  return {
    kind: "signed",
    bits: parseInt(bitsStr, 10) as 8 | 16 | 32 | 64,
  };
}

export function typeEquals(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  return typeEqualsSameKind(a, b);
}

function typeEqualsSameKind(a: Type, b: Type): boolean {
  switch (a.kind) {
    case "uint":
      return eqUint(a, b);
    case "signed":
      return eqSigned(a, b);
    case "bool":
      return b.kind === "bool";
    case "i32":
      return b.kind === "i32";
    case "ref":
      return equalsRef(a, b);
    case "struct":
      return eqStruct(a, b);
    case "array":
      return equalsArray(a, b);
    case "closure":
      return equalsClosure(a, b);
    default:
      return false;
  }
}

function eqUint(a: UintType, b: Type): boolean {
  return b.kind === "uint" && a.bits === b.bits;
}

function eqSigned(a: SignedType, b: Type): boolean {
  return b.kind === "signed" && a.bits === b.bits;
}

function eqStruct(a: StructType, b: Type): boolean {
  return b.kind === "struct" && a.name === b.name;
}

function equalsArray(a: ArrayType, b: Type): boolean {
  if (b.kind !== "array") return false;
  return a.size === b.size && typeEquals(a.elementType, b.elementType);
}

function equalsRef(a: RefType, b: Type): boolean {
  if (b.kind !== "ref") return false;
  return a.mutable === b.mutable && typeEquals(a.inner, b.inner);
}

function equalsClosure(a: ClosureType, b: Type): boolean {
  if (b.kind !== "closure") return false;
  if (a.paramTypes.length !== b.paramTypes.length) return false;
  for (let i = 0; i < a.paramTypes.length; i++) {
    if (!typeEquals(a.paramTypes[i]!, b.paramTypes[i]!)) return false;
  }
  return typeEquals(a.returnType, b.returnType);
}

export function isRefType(type: Type): boolean {
  return type.kind === "ref";
}

export function isArrayType(type: Type): boolean {
  return type.kind === "array";
}

export function isClosureType(type: Type): boolean {
  return type.kind === "closure";
}

export function typeBits(type: Type): number | null {
  if (type.kind === "uint") return type.bits;
  if (type.kind === "signed") return type.bits;
  return null;
}

export function isSignedType(type: Type): boolean {
  return type.kind === "signed";
}

export function isNarrower(a: Type, b: Type): boolean {
  if (a.kind === "closure" || b.kind === "closure") {
    return typeEquals(a, b);
  }
  if (a.kind === "array" && b.kind === "array") {
    return isNarrower(a.elementType, b.elementType);
  }
  const aBits = typeBits(a);
  const bBits = typeBits(b);
  if (aBits !== null && bBits !== null) {
    // Same family: simple bit comparison
    if (a.kind === b.kind) return aBits < bBits;
    // Cross-family widening: allow if target is strictly wider
    // e.g. U8 → I16 OK, I8 → U16 OK, I16 → U8 Error
    return aBits < bBits;
  }
  return false;
}
