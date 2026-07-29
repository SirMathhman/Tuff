/**
 * Grammar configuration for the Tuff language parser.
 * Defines grouping tokens, operator categories, and precedence levels.
 */

/** Opening → closing group mappings. */
export const OPENING: Record<string, string> = {
  "(": ")",
  "{": "}",
};

/** Operator categories used by the analyzer for type-checking decisions. */
export type OperatorCategory = "arithmetic" | "comparison" | "logical";

/**
 * Operator metadata: category for type-checking rules.
 * This is the single source of truth for operator classification.
 */
export const OPERATORS: ReadonlyMap<string, OperatorCategory> = new Map([
  // Arithmetic: numeric operands, widen result type
  ["+", "arithmetic"],
  ["-", "arithmetic"],
  ["*", "arithmetic"],
  ["/", "arithmetic"],
  // Comparison: numeric operands, bool result
  ["<", "comparison"],
  [">", "comparison"],
  ["==", "comparison"],
  ["!=", "comparison"],
  ["<=", "comparison"],
  [">=", "comparison"],
  // Logical: propagate operand types
  ["||", "logical"],
  ["&&", "logical"],
]);

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

/** Get the category of an operator, or `undefined` if not a known binary operator. */
export function getOperatorCategory(op: string): OperatorCategory | undefined {
  return OPERATORS.get(op);
}

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
