/** Centralized definition of all integer types. */
export interface IntType {
  name: string; // e.g. "u8", "u16"
  suffix: string; // e.g. "U8", "U16"
  min: number;
  max: number;
  signed: boolean;
  bits: number; // e.g. 8, 16
}

export const INT_TYPES: IntType[] = [
  { name: "u8", suffix: "U8", min: 0, max: 255, signed: false, bits: 8 },
  { name: "u16", suffix: "U16", min: 0, max: 65535, signed: false, bits: 16 },
  { name: "i8", suffix: "I8", min: -128, max: 127, signed: true, bits: 8 },
  {
    name: "i16",
    suffix: "I16",
    min: -32768,
    max: 32767,
    signed: true,
    bits: 16,
  },
  {
    name: "i32",
    suffix: "I32",
    min: -2147483648,
    max: 2147483647,
    signed: true,
    bits: 32,
  },
];

/** Float type definitions. */
export interface FloatType {
  name: string; // e.g. "f32"
  suffix: string; // e.g. "F32"
}

export const FLOAT_TYPES: FloatType[] = [
  { name: "f32", suffix: "F32" },
  { name: "f64", suffix: "F64" },
];

/** All numeric type names as a union. */
export type IntTypeName = (typeof INT_TYPES)[number]["name"];
export type FloatTypeName = (typeof FLOAT_TYPES)[number]["name"];
export type TypeName = IntTypeName | FloatTypeName;

/** All built-in type names (for `is` expressions and type-checker). */
export const BUILTIN_TYPES: string[] = [
  ...INT_TYPES.map((t) => t.name),
  ...FLOAT_TYPES.map((t) => t.name),
  "bool",
  "char",
];

/** Build regex fragment for typed number literals, longest suffix first. */
export function numberRegex(): string {
  const suffixes = [...INT_TYPES].sort(
    (a, b) => b.suffix.length - a.suffix.length,
  );
  return `\\d+(?:${suffixes.map((t) => t.suffix).join("|")})`;
}

/** Check if a text ends with a type suffix and return the type name, or undefined. */
export function matchSuffix(text: string): TypeName | undefined {
  for (const t of INT_TYPES) {
    if (text.endsWith(t.suffix)) return t.name;
  }
  for (const t of FLOAT_TYPES) {
    if (text.endsWith(t.suffix)) return t.name;
  }
  return undefined;
}

/** Find an IntType by name. */
export function getIntType(name: string): IntType | undefined {
  return INT_TYPES.find((t) => t.name === name);
}

/** Promote two integer types to the wider type. */
export function promoteTypes(a: IntTypeName, b: IntTypeName): IntTypeName {
  const aType = getIntType(a)!;
  const bType = getIntType(b)!;
  // If mixing signed and unsigned, promote to a signed type that can hold both
  if (aType.signed !== bType.signed) {
    const unsigned = aType.signed ? bType : aType;
    // Start with the wider bit width
    let bits = Math.max(aType.bits, bType.bits);
    // If the signed type can't hold the unsigned range, widen
    const signedType = INT_TYPES.find((t) => t.signed && t.bits === bits);
    if (!signedType || unsigned.max > signedType.max) {
      bits *= 2;
    }
    const target = INT_TYPES.find((t) => t.signed && t.bits === bits);
    if (!target) throw new Error(`No signed ${bits}-bit type found`);
    return target.name as IntTypeName;
  }
  return aType.max >= bType.max ? a : b;
}
