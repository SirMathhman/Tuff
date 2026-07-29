import type { EvalResult } from "./value";

/** Terminal kinds that propagate through blocks (e.g. yield exits a block). */
export const BLOCK_TERMINALS: Set<string> = new Set(["yield"]);

/** Terminal kinds that propagate through loops (e.g. break exits a loop). */
export const LOOP_TERMINALS: Set<string> = new Set(["break"]);

/** Check if a result is a terminal control-flow variant. */
export function isTerminal(r: EvalResult): boolean {
  return r.kind !== "value";
}

/** Check if a result should propagate through a block. */
export function isBlockTerminal(r: EvalResult): boolean {
  return BLOCK_TERMINALS.has(r.kind);
}

/** Check if a result should propagate through a loop. */
export function isLoopTerminal(r: EvalResult): boolean {
  return LOOP_TERMINALS.has(r.kind);
}
