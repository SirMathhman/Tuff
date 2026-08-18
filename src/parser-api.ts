import { type ParseError } from "./errors.js";
import { type Token } from "./tokenize.js";

/**
 * A value binding: a number, whether it may be assigned, and the kind of
 * value it was initialized with (a boolean literal or a number).
 */
export type ValueBinding = {
  kind: "value";
  value: number;
  mutable: boolean;
  literal: "number" | "boolean";
};

/**
 * A variable binding. A `value` binding holds a number; a `ref` binding
 * points directly at a value binding object (so it tracks reassignment and
 * is unaffected by shadowing), with `mutable` indicating whether writes
 * through it are allowed.
 */
export type Binding =
  | ValueBinding
  | {
      kind: "ref";
      target: ValueBinding;
      mutable: boolean;
    };

/**
 * The subset of the parser that grammar-fragment helpers rely on. Helpers
 * depend on this interface (not the concrete `Parser` class) so the
 * dependency graph stays a DAG.
 */
export interface ParserApi {
  pos: number;
  scopes: Map<string, Binding>[];
  error: ParseError | null;
  peek(): Token | undefined;
  advance(): Token | undefined;
  parseExpression(): number | null;
  parseStatements(): boolean;
  parseAssignmentRhs(): { literal: "boolean" | "number" | null; value: number } | null;
  lookupOrError(name: string): Binding | null;
  lookup(name: string): Binding | null;
  checkTypeMismatch(
    name: string,
    binding: ValueBinding,
    literal: "boolean" | "number" | null,
  ): boolean;
}
