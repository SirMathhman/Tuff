import type { TuffError } from "../errors.ts";
import type { Result } from "../result.ts";
import type { Operand, Scope, Value } from "../scope.ts";
import type { Token } from "../tokenize.ts";

// The result of parsing: a plain value, the index after it, and the scope it
// leaves behind (assignments inside a block can change it).
export interface Parsed {
  value: Operand;
  next: number;
  scope: Scope;
}

// The result of a let or assignment value: a number, a boolean, or a reference.
export interface Evaluated {
  value: Value;
  next: number;
  scope: Scope;
}

export type ParseResult<T> = Result<T, TuffError>;

// A parser for one factor. The grammar functions receive it as a parameter
// instead of calling parseFactor directly, which breaks the recursion cycle.
export type Parser = (
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
) => ParseResult<Parsed>;
