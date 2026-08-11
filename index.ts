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
  if (tuffSource.trim() === "") {
    return {
      isOk: true,
      value: "",
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
