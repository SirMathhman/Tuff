import type { Result, TuffError } from "./errors";
import { reduceOperators } from "./operations";
import type { ParserState } from "./types";
import { Step } from "./types";
import { stepOperand } from "./parse/operands";
import { stepOperator } from "./parse/operators";

/**
 * Evaluates a Tuff program: `let NAME = value;` statements followed by an
 * expression. Integers, booleans (`true` and `false`), variables, `+`, `-`, `*`,
 * comparisons, signs, parentheses, braces, and `if (condition) a else b` are
 * supported. A boolean cannot be used in arithmetic. Only the chosen branch of an
 * `if` takes effect, so errors in the other branch are ignored. The final value of
 * a boolean program is 1 or 0. Braces open a block scope, and the value of a block
 * is its last expression. Uses explicit stacks, so nesting depth is not limited by
 * the JavaScript call stack. Offsets in errors refer to the unmodified source.
 *
 * @param tuffSource - the program to evaluate.
 * @returns the value on success, or a TuffError describing the first syntax error.
 */
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const state: ParserState = {
    source: tuffSource,
    pos: 0,
    values: [],
    ops: [],
    scopes: [new Map()],
    depth: 0,
    skipDepth: 0,
    expectOperand: true,
    flags: {
      atStatementStart: true,
      afterLet: false,
      lastStatementEnded: false,
    },
  };
  for (;;) {
    const outcome = state.expectOperand
      ? stepOperand(state)
      : stepOperator(state);
    if (outcome === Step.End) break;
    if (outcome !== Step.Continue) return outcome;
  }
  const failure = reduceOperators(state.values, state.ops);
  if (failure !== undefined) return failure;
  const { values } = state;
  const result = values.pop() ?? 0;
  return {
    ok: true,
    value: typeof result === "boolean" ? Number(result) : result,
  };
}
