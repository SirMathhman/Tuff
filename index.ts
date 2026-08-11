export interface Ok<T> {
  isOk: true;
  value: T;
}

export interface Err<X> {
  isOk: false;
  value: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export enum CompileErrorType {
  Invalid,
}

export interface CompileError {
  type: CompileErrorType;
  message: string;
}

export function compileTuffToJS(
  tuffSource: string,
): Result<string, CompileError> {
  const trimmed = tuffSource.trim();
  if (trimmed === "") {
    return {
      isOk: true,
      value: "",
    };
  }
  if (/^\d+\s*\+\s*\d+$/.test(trimmed) || /^\d+$/.test(trimmed)) {
    return {
      isOk: true,
      value: "process.exit(" + trimmed + ")",
    };
  }
  return {
    isOk: false,
    value: {
      type: CompileErrorType.Invalid,
      message: "Invalid source: " + tuffSource,
    },
  };
}
