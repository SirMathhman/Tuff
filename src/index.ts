import type { TuffResult } from "./errors.ts";
import { createRefRegistry, executeStatements } from "./evaluator.ts";
import { parseProgram } from "./parser.ts";
import type { Binding } from "./scopes.ts";

export type {
  TuffError,
  TuffOk,
  TuffErr,
  TuffResult,
  UnidentifiedIdentifierError,
  InvalidExpressionError,
  InvalidStatementError,
  ImmutableAssignmentError,
  InvalidDerefError,
} from "./errors.ts";
export type {
  TuffExpr,
  TuffStatement,
  LiteralNode,
  IdentifierNode,
  OrNode,
  AndNode,
  AddNode,
  EqualNode,
  RefNode,
  DerefNode,
  LetNode,
  AssignNode,
  ReturnNode,
  BlockNode,
} from "./parser.ts";
export type { Binding } from "./scopes.ts";
export type { RefRegistry } from "./evaluator.ts";

/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score, or an error if an identifier is not defined.
 */
export function evaluateTuff(s: string): TuffResult {
  const program = parseProgram(s, 1);
  if (!Array.isArray(program)) {
    return { ok: false, error: program };
  }
  const scopes: Map<string, Binding>[] = [new Map()];
  const refs = createRefRegistry();
  const result = executeStatements(program, scopes, 1, refs);
  return result ?? { ok: true, value: 0 };
}
