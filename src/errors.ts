export type ErrorKind =
  | "syntax"
  | "number"
  | "overflow"
  | "undefined"
  | "immutable";

export type EvalFailure = {
  kind: ErrorKind;
  message: string;
  position: number;
};
