import type { TuffResult } from "./errors.ts";
import { executeStatements } from "./evaluator.ts";
import { parseProgram } from "./parser.ts";
import { createEnvironment } from "./scopes.ts";
import { tokenize } from "./tokenizer.ts";
import { typecheckProgram } from "./typecheck.ts";

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
  InvalidReferenceError,
  TypeMismatchError,
  UnexpectedCharacterError,
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
  LessNode,
  RefNode,
  DerefNode,
  LetNode,
  AssignNode,
  ReturnNode,
  BlockNode,
  IfNode,
  WhileNode,
} from "./parser.ts";
export type { Binding, Environment } from "./scopes.ts";

/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score, or an error if an identifier is not defined.
 */
export function evaluateTuff(s: string): TuffResult {
  const tokens = tokenize(s);
  if (!Array.isArray(tokens)) {
    return {
      ok: false,
      error: {
        kind: "UnexpectedCharacter",
        character: tokens.character,
        line: tokens.line,
      },
    };
  }
  const program = parseProgram(tokens, 1);
  if (!Array.isArray(program)) {
    return { ok: false, error: program };
  }
  const typeError = typecheckProgram(program, 1);
  if (typeError) {
    return { ok: false, error: typeError };
  }
  const env = createEnvironment();
  const result = executeStatements(program, 1, env);
  return result ?? { ok: true, value: 0 };
}
