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
      readonly kind: "semantic";
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
export function err(kind: EvalError["kind"], message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}
