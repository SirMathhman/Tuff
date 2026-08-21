export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EvalError =
  | { kind: "invalid-token"; index: number; token: string }
  | { kind: "unexpected-end"; index: number }
  | { kind: "unbalanced-paren"; index: number }
  | { kind: "unknown-variable"; index: number; name: string };

export type Token = { value: string; index: number };
