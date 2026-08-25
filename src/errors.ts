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
  UnbalancedParen: "UnbalancedParen",
  InvalidNumberLiteral: "InvalidNumberLiteral",
  TypeMismatch: "TypeMismatch",
} as const;

export type EvaluateErrorKind =
  (typeof EvaluateErrorKind)[keyof typeof EvaluateErrorKind];

export type EvaluateError =
  | { kind: "EmptyInput"; position: number }
  | { kind: "UnexpectedCharacter"; ch: string; position: number }
  | { kind: "UnsupportedExpression"; position: number }
  | { kind: "UndeclaredVariable"; name: string; position: number }
  | { kind: "DuplicateDeclaration"; name: string; position: number }
  | {
      kind: "ExpectedToken";
      expected: string;
      found?: string;
      position: number;
    }
  | { kind: "EmptyStatement"; position: number }
  | { kind: "MissingTerminator"; position: number }
  | { kind: "CodeAfterReturn"; position: number }
  | { kind: "ImmutableReassignment"; name: string; position: number }
  | { kind: "UnbalancedBrace"; position: number }
  | { kind: "UnbalancedParen"; position: number }
  | { kind: "InvalidNumberLiteral"; literal: string; position: number }
  | {
      kind: "TypeMismatch";
      name: string;
      expected: "number" | "boolean";
      found: "number" | "boolean";
      position: number;
    };

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: EvaluateError };

export function fail<T>(error: EvaluateError): Result<T> {
  return { ok: false, error };
}
