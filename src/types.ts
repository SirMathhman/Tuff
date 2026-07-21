// ── Type AST ────────────────────────────────────────────────────────────────

export type Type = UintType | BoolType | I32Type | RefType | StructType;

export interface UintType {
  kind: "uint";
  bits: 8 | 16 | 32;
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

// ── Type Helpers ────────────────────────────────────────────────────────────

export function typeToString(type: Type): string {
  switch (type.kind) {
    case "uint":
      return `U${type.bits}`;
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
  }
}

export function parseTypeString(str: string): Type | null {
  if (str === "Bool") return { kind: "bool" };
  if (str === "I32") return { kind: "i32" };
  const uintMatch = str.match(/^U(8|16|32)$/);
  if (uintMatch)
    return { kind: "uint", bits: parseInt(uintMatch[1]!, 10) as 8 | 16 | 32 };
  const refMatch = str.match(/^&mut (.+)$/);
  if (refMatch) {
    const inner = parseTypeString(refMatch[1]!);
    if (inner) return { kind: "ref", mutable: true, inner };
  }
  const refMatch2 = str.match(/^&(.+)$/);
  if (refMatch2) {
    const inner = parseTypeString(refMatch2[1]!);
    if (inner) return { kind: "ref", mutable: false, inner };
  }
  // Treat as struct type
  return { kind: "struct", name: str };
}

export function typeEquals(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  return typeEqualsSameKind(a, b);
}

function typeEqualsSameKind(a: Type, b: Type): boolean {
  switch (a.kind) {
    case "uint":
      return b.kind === "uint" && a.bits === b.bits;
    case "bool":
      return b.kind === "bool";
    case "i32":
      return b.kind === "i32";
    case "ref":
      return (
        b.kind === "ref" &&
        a.mutable === b.mutable &&
        typeEquals(a.inner, b.inner)
      );
    case "struct":
      return b.kind === "struct" && a.name === b.name;
  }
}

export function isRefType(type: Type): boolean {
  return type.kind === "ref";
}

export function typeBits(type: Type): number | null {
  if (type.kind === "uint") return type.bits;
  return null;
}

export function isNarrower(a: Type, b: Type): boolean {
  const aBits = typeBits(a);
  const bBits = typeBits(b);
  if (aBits !== null && bBits !== null) return aBits < bBits;
  return false;
}
