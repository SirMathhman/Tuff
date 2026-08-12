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
];

/** All type names as a union. */
export type IntTypeName = (typeof INT_TYPES)[number]["name"];

/** Build regex fragment for typed number literals, longest suffix first. */
export function numberRegex(): string {
  const suffixes = [...INT_TYPES].sort((a, b) => b.suffix.length - a.suffix.length);
  return `\\d+(?:${suffixes.map((t) => t.suffix).join("|")})`;
}

/** Check if a text ends with a type suffix and return the type name, or undefined. */
export function matchSuffix(text: string): IntTypeName | undefined {
  for (const t of INT_TYPES) {
    if (text.endsWith(t.suffix)) return t.name;
  }
  return undefined;
}

/** Get the type definition by name. */
export function getIntType(name: IntTypeName): IntType {
  const t = INT_TYPES.find((t) => t.name === name);
  if (!t) throw new Error(`Unknown type: ${name}`);
  return t;
}
