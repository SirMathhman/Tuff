export type ErrorKind = "syntax" | "number" | "overflow";

export type EvalError = {
  kind: ErrorKind;
  message: string;
  position: number;
};
