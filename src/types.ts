/** Centralized definition of all integer types. */
export interface IntType {
  name: string; // e.g. "u8", "u16"
  suffix: string; // e.g. "U8", "U16"
  min: number;
  max: number;
  signed: boolean;
}

export const INT_TYPES: IntType[] = [
  { name: "u8", suffix: "U8", min: 0, max: 255, signed: false },
  { name: "u16", suffix: "U16", min: 0, max: 65535, signed: false },
  { name: "i8", suffix: "I8", min: -128, max: 127, signed: true },
  { name: "i16", suffix: "I16", min: -32768, max: 32767, signed: true },
];

/** All type names as a union. */
export type IntTypeName = (typeof INT_TYPES)[number]["name"];

/** Build regex fragment for typed number literals, longest suffix first. */
export function numberRegex(): string {
  const suffixes = [...INT_TYPES].sort(
    (a, b) => b.suffix.length - a.suffix.length,
  );
  return `\\d+(?:${suffixes.map((t) => t.suffix).join("|")})`;
}

/** Check if a text ends with a type suffix and return the type name, or undefined. */
export function matchSuffix(text: string): IntTypeName | undefined {
  for (const t of INT_TYPES) {
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
  // If mixing signed and unsigned, promote to wider signed type
  if (aType.signed !== bType.signed) {
    // Need a signed type that can hold both ranges
    const widerMax = Math.max(aType.max, bType.max);
    const bits = widerMax > 127 ? "16" : "8";
    return `i${bits}` as IntTypeName;
  }
  return aType.max >= bType.max ? a : b;
}
