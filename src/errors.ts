/**
 * A structured error describing why evaluation failed.
 */
export type EvaluateError =
  | { kind: "invalid-number"; input: string; reason: string }
  | { kind: "malformed-expression"; input: string; reason: string }
  | { kind: "unknown-variable"; input: string; name: string; reason: string }
  | { kind: "immutable-assignment"; input: string; name: string; reason: string }
  | { kind: "invalid-dereference"; input: string; name: string; reason: string };

/**
 * The result of evaluating a Tuff expression.
 */
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: EvaluateError };
