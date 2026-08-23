export interface Position {
  readonly line: number;
  readonly column: number;
}

export type EvalError =
  | {
      readonly kind: "syntax";
      readonly message: string;
      readonly position: Position;
      readonly snippet: string;
    }
  | {
      readonly kind: "mutability";
      readonly message: string;
      readonly position: Position;
      readonly snippet: string;
    }
  | {
      readonly kind: "runtime";
      readonly message: string;
      readonly position: Position;
      readonly snippet: string;
    };
