/**
 * Words with a fixed meaning that cannot be used as variable, function or type names.
 */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  "let",
  "mut",
  "true",
  "false",
  "if",
  "else",
  "while",
  "match",
  "case",
  "_",
  "for",
  "loop",
  "break",
  "fn",
  "type",
  "struct",
  "extern",
  "declare",
  "out",
]);
