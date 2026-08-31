export type ErrorKind = "syntax" | "number" | "overflow" | "undefined";

export type EvalFailure = {
  kind: ErrorKind;
  message: string;
  position: number;
};
