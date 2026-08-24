export interface Position {
  readonly line: number;
  readonly column: number;
}

export enum ErrorKind {
  Syntax = "syntax",
  Semantic = "semantic",
  Mutability = "mutability",
  Runtime = "runtime",
}

export interface SyntaxError {
  readonly kind: ErrorKind.Syntax;
  readonly message: string;
  readonly position: Position;
  readonly snippet: string;
}

export interface SemanticError {
  readonly kind: ErrorKind.Semantic;
  readonly message: string;
  readonly position: Position;
  readonly snippet: string;
}

export interface MutabilityError {
  readonly kind: ErrorKind.Mutability;
  readonly message: string;
  readonly position: Position;
  readonly snippet: string;
}

export interface RuntimeError {
  readonly kind: ErrorKind.Runtime;
  readonly message: string;
  readonly position: Position;
  readonly snippet: string;
}

export type EvalError = SyntaxError | SemanticError | MutabilityError | RuntimeError;
export function err(kind: ErrorKind, message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}
