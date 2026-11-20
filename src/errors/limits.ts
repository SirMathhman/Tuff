import type { Failure, TuffError } from "./core";
import { fail } from "./core";

/**
 * Reports a program that runs more parse steps than the limit allows.
 *
 * @param where - the offset where the limit was reached.
 * @returns a failure describing the excess work.
 */
export function tooMuchWork(where: number): Failure<TuffError> {
  return fail(
    "Program does too much work",
    where,
    "The program runs more steps than allowed, from a loop that never ends or from calls that repeat a lot of work.",
    "Make the loop end, or remove repeated calls to earlier functions.",
  );
}

/**
 * Reports calls nested too deeply, which happens when a function calls itself without end.
 *
 * @param where - the offset of the call that exceeded the limit.
 * @returns a failure describing the nesting.
 */
export function recursionTooDeep(where: number): Failure<TuffError> {
  return fail(
    "Function calls are nested too deeply",
    where,
    "Each call starts its body inside the previous call, and the calls never end.",
    "Check the function for a call to itself that has no end.",
  );
}
