import type { EvalResult } from "./value";

/** Evaluation contexts that can have terminal control-flow behavior. */
export type TerminalContext = "block" | "loop" | "expression";

/**
 * Mapping of evaluation contexts to the terminal kinds that propagate through them.
 *
 * - "block": terminals that exit a block (e.g. yield)
 * - "loop": terminals that exit a loop (e.g. break)
 * - "expression": terminals that propagate through all expression contexts (e.g. return)
 *
 * Adding a new terminal: add the kind to the relevant context sets.
 * Adding a new context: add a new entry to this map and the TerminalContext type.
 */
const TERMINAL_MAP: Record<TerminalContext, Set<string>> = {
  block: new Set(["yield"]),
  loop: new Set(["break"]),
  expression: new Set(["return"]),
};

/** Check if a result should propagate through the given context. */
export function shouldPropagate(
  r: EvalResult,
  context: TerminalContext,
): boolean {
  return TERMINAL_MAP[context].has(r.kind);
}

/** Check if a result is a terminal control-flow variant (not a normal value). */
export function isTerminal(r: EvalResult): boolean {
  return r.kind !== "value";
}
