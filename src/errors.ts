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
  UnbalancedBrace: "UnbalancedBrace",
} as const;

export type EvaluateErrorKind =
  (typeof EvaluateErrorKind)[keyof typeof EvaluateErrorKind];

export type EvaluateError =
  | { kind: "EmptyInput"; position: number }
  | { kind: "UnexpectedCharacter"; ch: string; position: number }
  | { kind: "UnsupportedExpression"; position: number }
  | { kind: "UndeclaredVariable"; name: string; position: number }
  | { kind: "DuplicateDeclaration"; name: string; position: number }
  | { kind: "ExpectedToken"; expected: string; found?: string; position: number }
  | { kind: "EmptyStatement"; position: number }
  | { kind: "MissingTerminator"; position: number }
  | { kind: "CodeAfterReturn"; position: number }
  | { kind: "ImmutableReassignment"; name: string; position: number }
  | { kind: "UnbalancedBrace"; position: number };

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: EvaluateError };
