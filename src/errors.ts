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

/** Internal error carrying a position; converted to an EvalError by evaluate. */
export class TuffError extends Error {
  constructor(
    readonly kind: EvalError["kind"],
    message: string,
    readonly position: Position,
  ) {
    super(message);
    this.name = "TuffError";
  }
}

export function toEvalError(e: TuffError, source: string): EvalError {
  const snippet = source.split("\n")[e.position.line - 1] ?? "";
  return {
    kind: e.kind,
    message: e.message,
    position: e.position,
    snippet,
  };
}
