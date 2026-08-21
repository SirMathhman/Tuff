import type { Span } from "./ast.ts";

export type EvalError =
  | {
      kind: "invalid_input";
      input: string;
      reason: string;
      hint: string;
      span: Span;
    }
  | {
      kind: "division_by_zero";
      input: string;
      reason: string;
      hint: string;
      span: Span;
    };
