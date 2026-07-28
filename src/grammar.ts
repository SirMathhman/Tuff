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
 * Each level lists operators and their associativity.
 * The highest-precedence parser (atom parsing) sits below this chain.
 */
export const PRECEDENCE = [
  { ops: ["+", "-"] as const, associativity: "left" as const },
  { ops: ["*", "/"] as const, associativity: "left" as const },
];
