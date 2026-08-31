export type ErrorKind = "syntax" | "number" | "overflow" | "undefined";

export type EvalError = {
  kind: ErrorKind;
  message: string;
  position: number;
};
