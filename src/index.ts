import assert from "node:assert";
import type { TuffResult } from "./errors.ts";
import { executeStatements, isBreak, isContinue } from "./evaluator.ts";
import { parseProgram } from "./parser.ts";
import { createEnvironment } from "./scopes.ts";
import { tokenize } from "./tokenizer.ts";
import { typecheckProgram } from "./typecheck/index.ts";

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
  BreakOutsideLoopError,
  ContinueOutsideLoopError,
  InvalidTupleIndexError,
  InvalidArrayIndexError,
  InvalidNumberSuffixError,
  NumberOutOfRangeError,
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
  TupleNode,
  TupleIndexNode,
  ArrayNode,
  ArrayIndexNode,
  RangeNode,
  LetNode,
  AssignNode,
  ReturnNode,
  BlockNode,
  IfNode,
  WhileNode,
  BreakNode,
  ContinueNode,
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
  const checked = typecheckProgram(program, 1);
  if (!Array.isArray(checked)) {
    return { ok: false, error: checked };
  }
  const env = createEnvironment();
  const result = executeStatements(checked, 1, env);
  assert(
    !isBreak(result) && !isContinue(result),
    "control-flow signal must be consumed by an enclosing loop",
  );
  return result ?? { ok: true, value: 0 };
}
