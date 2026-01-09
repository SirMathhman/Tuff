/**
 * Handlers for if statements extracted from interpretBlockInternal.
 */
import { evaluateReturningOperand, isTruthy } from "../eval";
import { findMatchingParen } from "../interpret_helpers";
import { runBody } from "./loop_handlers";
import { Env } from "../env";
import type { InterpretFn } from "../types";

/**
 * Handle if statement (statement-level, optional else)
 * Returns true if the statement was handled
 */
export function handleIfStatement(
  stmt: string,
  localEnv: Env,
  interpret: InterpretFn
): boolean {
  if (!/^if\b/.test(stmt)) return false;

  const start = stmt.indexOf("(");
  if (start === -1) throw new Error("invalid if syntax");
  const endIdx = findMatchingParen(stmt, start);
  if (endIdx === -1)
    throw new Error("invalid if syntax: unbalanced parentheses");
  const cond = stmt.slice(start + 1, endIdx).trim();
  let rest = stmt.slice(endIdx + 1).trim();
  if (!rest) throw new Error("missing if body");

  // helper to find a braced block end and throw a contextual error
  function findBracedEndOrThrow(s: string, err: string) {
    const bEnd = findMatchingParen(s, 0, "{", "}");
    if (bEnd === -1) throw new Error(err);
    return bEnd;
  }

  // parse true body (braced block or single statement)
  let trueBody = "";
  let falseBody: string | undefined = undefined;
  if (rest.startsWith("{")) {
    const bEnd = findBracedEndOrThrow(rest, "unbalanced braces in if");
    trueBody = rest.slice(0, bEnd + 1).trim();
    rest = rest.slice(bEnd + 1).trim();
  } else {
    // single statement body; could be followed by 'else <body>' in the same statement
    const elseIdx = rest.indexOf(" else ");
    if (elseIdx !== -1) {
      trueBody = rest.slice(0, elseIdx).trim();
      rest = rest.slice(elseIdx + 6).trim();
    } else {
      trueBody = rest.trim();
      rest = "";
    }
  }

  // if an else body remains, parse it similarly
  if (rest) {
    if (rest.startsWith("{")) {
      const bEnd = findBracedEndOrThrow(rest, "unbalanced braces in if else");
      falseBody = rest.slice(0, bEnd + 1).trim();
    } else {
      falseBody = rest.trim();
    }
  }

  const condOpnd = evaluateReturningOperand(cond, localEnv);
  if (isTruthy(condOpnd)) {
    runBody(trueBody, localEnv, interpret);
  } else if (falseBody) {
    runBody(falseBody, localEnv, interpret);
  }

  return true;
}
