/**
 * Structured error type for the Tuff interpreter.
 * Replaces raw `throw new Error(string)` with categorized errors
 * that map to the three pipeline stages: parse, type, runtime.
 */
export class InterpreterError extends Error {
  constructor(
    public kind: "parse" | "type" | "runtime",
    message: string,
    public position?: { line: number; column: number },
  ) {
    super(message);
    this.name = "InterpreterError";
  }
}
