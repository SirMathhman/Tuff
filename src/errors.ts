export const EvaluateErrorKind = {
  EmptyInput: "EmptyInput",
  UnexpectedCharacter: "UnexpectedCharacter",
  UnsupportedExpression: "UnsupportedExpression",
  UndeclaredVariable: "UndeclaredVariable",
  DuplicateDeclaration: "DuplicateDeclaration",
  ExpectedToken: "ExpectedToken",
  EmptyStatement: "EmptyStatement",
  MissingTerminator: "MissingTerminator",
  CodeAfterReturn: "CodeAfterReturn",
  ImmutableReassignment: "ImmutableReassignment",
} as const;

export type EvaluateErrorKind =
  (typeof EvaluateErrorKind)[keyof typeof EvaluateErrorKind];

export type EvaluateError =
  | { kind: "EmptyInput" }
  | { kind: "UnexpectedCharacter"; ch: string; position: number }
  | { kind: "UnsupportedExpression" }
  | { kind: "UndeclaredVariable"; name: string }
  | { kind: "DuplicateDeclaration"; name: string }
  | { kind: "ExpectedToken"; expected: string; found?: string }
  | { kind: "EmptyStatement" }
  | { kind: "MissingTerminator" }
  | { kind: "CodeAfterReturn" }
  | { kind: "ImmutableReassignment"; name: string };

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: EvaluateError };
