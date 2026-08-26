import type { TuffError } from "./errors.ts";
import { parse } from "./parser.ts";
import { exec } from "./evaluator.ts";
import { typeCheck } from "./typecheck.ts";

/**
 * A successful evaluation result.
 */
export interface Ok {
  ok: true;
  value: number;
}

/**
 * A failed evaluation result.
 */
export interface Err {
  ok: false;
  error: TuffError;
}

/**
 * The result of an evaluation: either a numeric value or a structured error.
 */
export type Result = Ok | Err;

/**
 * Evaluate the tuffness of a string.
 *
 * @param input - The string to evaluate.
 * @returns The tuffness score or a structured error.
 */
export function evaluateTuff(input: string): Result {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  const err = typeCheck(parsed.program.stmts, new Map());
  if (!err.ok) return err;
  return { ok: true, value: exec(parsed.program.stmts, new Map()) };
}
