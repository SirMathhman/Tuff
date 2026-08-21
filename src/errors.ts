export type EvalError =
  | {
      kind: "invalid_input";
      input: string;
      reason: string;
      hint: string;
    }
  | {
      kind: "division_by_zero";
      input: string;
      reason: string;
      hint: string;
    };
