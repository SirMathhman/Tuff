/**
 * A 1-based source position, as reported by the lexer and carried
 * through to structured errors.
 */
export type SourcePosition = {
  /** The 1-based line number. */
  line: number;
  /** The 1-based column number. */
  column: number;
};
