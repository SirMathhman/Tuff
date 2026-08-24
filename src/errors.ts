/**
 * Structured error definitions. Each error answers four questions:
 * what is this error, where is the cause (input + position), why is it an
 * error, and what the caller can do to fix it.
 */
export type EvalError = UnhandledInputError;

export interface UnhandledInputError {
  kind: "unhandled_input";
  /** The offending input, verbatim. */
  input: string;
  /** Why this is an error. */
  reason: string;
  /** What the caller can do to fix it. */
  fix: string;
}

export function unhandledInput(input: string): UnhandledInputError {
  return {
    kind: "unhandled_input",
    input,
    reason: `The expression ${JSON.stringify(input)} is not yet supported.`,
    fix: 'Use a supported expression form (e.g. "return 1;").',
  };
}
