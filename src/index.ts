import type { TuffResult } from "./errors.ts";
import {
  executeStatements,
  splitStatements,
  type Binding,
} from "./evaluator.ts";

export type {
  TuffError,
  TuffOk,
  TuffErr,
  TuffResult,
  UnidentifiedIdentifierError,
  InvalidExpressionError,
  ImmutableAssignmentError,
} from "./errors.ts";
export type {
  TuffExpr,
  LiteralNode,
  IdentifierNode,
  OrNode,
  AndNode,
  AddNode,
} from "./parser.ts";
export type { Binding } from "./evaluator.ts";

/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score, or an error if an identifier is not defined.
 */
export function evaluateTuff(s: string): TuffResult {
  const scopes: Map<string, Binding>[] = [new Map()];
  const result = executeStatements(splitStatements(s), scopes, 1);
  return result ?? { ok: true, value: 0 };
}
