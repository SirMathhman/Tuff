/** A value expression: a literal or a variable reference. */
export type Value =
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "ident"; name: string };

/** A single program statement. `index` is its position in the flattened statement list. */
export type Statement =
  | { kind: "let"; name: string; mutable: boolean; value: Value; index: number }
  | { kind: "assign"; name: string; value: Value; index: number }
  | { kind: "return"; value: Value; index: number };

/** A parsed program: a flat list of statements (block contents are inlined). */
export type Program = { statements: Statement[] };
