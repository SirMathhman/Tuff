export interface Ok<T> {
  isOk: true;
  value: T;
}

export interface Err<X> {
  isOk: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export interface CompileError {
  message: string;
  reason: string;
  suggestedFix: string;
  line: number;
  column: number;
}

export function compileTuffToTS(
  tuffSource: string,
): Result<string, CompileError> {
  if (tuffSource.length === 0)
    return {
      isOk: true,
      value: "process.exit(0)",
    };

  return {
    isOk: false,
    error: {
      message: "Invalid source code: " + tuffSource,
      reason: "Compiler support for this source code is not provided yet.",
      suggestedFix: "Switch to supported syntax.",
      line: 0,
      column: 0,
    },
  };
}
