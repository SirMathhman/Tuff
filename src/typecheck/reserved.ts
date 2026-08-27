import type { TuffError } from "../errors.ts";

/** The reserved words that may not be used as identifiers. */
const RESERVED_WORDS = [
  "let",
  "type",
  "struct",
  "fn",
  "return",
  "if",
  "while",
  "for",
  "break",
  "continue",
  "mut",
  "is",
  "true",
  "false",
];

/**
 * Check that a binding name is not a reserved word.
 * @param name - The identifier to check.
 * @param line - The 1-based line number.
 * @returns A ReservedIdentifier error if the name is reserved, else null.
 */
export function checkReservedName(
  name: string,
  line: number,
): TuffError | null {
  return RESERVED_WORDS.includes(name)
    ? { kind: "ReservedIdentifier", name, line }
    : null;
}
