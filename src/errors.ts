/**
 * A structured error describing why evaluation failed.
 */
export type EvaluateError =
  | { kind: "invalid-number"; input: string; reason: string }
  | { kind: "malformed-expression"; input: string; reason: string }
  | { kind: "unknown-variable"; input: string; name: string; reason: string }
  | { kind: "immutable-assignment"; input: string; name: string; reason: string }
  | { kind: "invalid-dereference"; input: string; name: string; reason: string }
  | { kind: "reference-as-value"; input: string; name: string; reason: string }
  | { kind: "type-mismatch"; input: string; name: string; reason: string };

/**
 * The result of evaluating a Tuff expression.
 */
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: EvaluateError };

/**
 * A parse failure recorded by the parser, before it is mapped to an
 * `EvaluateError` (which adds the input and a human-readable reason).
 */
export type ParseError =
  | { kind: "malformed-expression" }
  | {
      kind:
        "unknown-variable" | "immutable-assignment" | "invalid-dereference" | "reference-as-value";
      name: string;
    }
  | {
      kind: "type-mismatch";
      name: string;
      from: "boolean" | "number";
      to: "boolean" | "number";
    };

/**
 * The result of parsing a token stream.
 */
export type ParseResult = { ok: true; value: number } | { ok: false; error: ParseError };
