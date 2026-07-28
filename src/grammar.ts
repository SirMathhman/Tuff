/**
 * Grammar configuration for the Tuff language parser.
 * Defines grouping tokens and operator precedence levels.
 */

/** Opening → closing group mappings. */
export const OPENING: Record<string, string> = {
  "(": ")",
  "{": "}",
};

/**
 * Precedence levels, ordered from lowest (parsed first) to highest (parsed last).
 * Each level lists the operators at that precedence.
 * The highest-precedence parser (atom parsing) sits below this chain.
 */
export const PRECEDENCE: readonly string[][] = [
  ["||"], // logical OR
  ["&&"], // logical AND
  ["<", ">", "==", "!=", "<=", ">="], // comparison
  ["+", "-"], // additive
  ["*", "/"], // multiplicative
];

/** All binary operators, derived from the precedence table. */
export type BinaryOp = (typeof PRECEDENCE)[number][number];

/**
 * Type suffix definitions for numeric literals.
 * Each entry defines a prefix letter, and min/max range functions based on bit width.
 */
export const TYPE_SUFFIXES: readonly {
  prefix: string;
  min: (bits: number) => number;
  max: (bits: number) => number;
}[] = [
  {
    prefix: "U",
    min: () => 0,
    max: (bits: number) => Math.pow(2, bits) - 1,
  },
  {
    prefix: "I",
    min: (bits: number) => -Math.pow(2, bits - 1),
    max: (bits: number) => Math.pow(2, bits - 1) - 1,
  },
  {
    prefix: "F",
    min: () => -Infinity,
    max: () => Infinity,
  },
];

/** Valid type suffix prefixes, derived from the table. */
export type TypeSuffixPrefix = (typeof TYPE_SUFFIXES)[number]["prefix"];

/** Extract bit width from a type name like "U16" → 16. Returns 0 for unknown types. */
export function getTypeBits(typeName: string): number {
  const match = typeName.match(/^([UIF])(\d+)$/);
  if (!match) return 0;
  return Number(match[2]);
}
