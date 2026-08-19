/** A value expression: a literal, a variable reference, or a binary operation. */
export type Value =
  | { kind: "number"; value: number; position: number }
  | { kind: "bool"; value: boolean; position: number }
  | { kind: "ident"; name: string; position: number }
  | {
      kind: "binary";
      operator: "==" | "<";
      left: Value;
      right: Value;
      position: number;
    };

/**
 * A single program statement. `position` is the zero-based source offset of
 * the statement's first token.
 */
export type Statement =
  | { kind: "let"; name: string; mutable: boolean; value: Value; position: number }
  | { kind: "assign"; name: string; value: Value; position: number }
  | { kind: "return"; value: Value; position: number }
  | { kind: "block"; statements: Statement[]; position: number };

/** A parsed program: a list of top-level statements. */
export type Program = { statements: Statement[] };
