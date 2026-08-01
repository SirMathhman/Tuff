// CompileError: a structured error produced by the compiler.
// Not the default JS Error (we don't throw or catch). Carries a `kind` to
// distinguish semantic (scope) errors from syntax/lexical errors.

export type CompileErrorKind = "scope" | "syntax";

export interface CompileError {
  kind: CompileErrorKind;
  message: string;
}

export function compileError(kind: CompileErrorKind, message: string): CompileError {
  return { kind, message };
}
