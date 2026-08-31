export type ErrorKind =
  | "syntax"
  | "number"
  | "overflow"
  | "undefined"
  | "immutable"
  | "type";

export type EvalFailure = {
  kind: ErrorKind;
  message: string;
  position: number;
};
