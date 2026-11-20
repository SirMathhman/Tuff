import type { Failure, TuffError } from "./core";
import { fail } from "./core";

/**
 * Reports a function name used without parentheses.
 *
 * @param where - the offset of the name.
 * @param name - the function name.
 * @returns a failure describing the uncalled function.
 */
export function functionNotCalled(
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Function '${name}' must be called with '()'`,
    where,
    "A function is not a value, so it can only be called.",
    `Write '${name}()' to call it.`,
  );
}

/**
 * Reports a call of a name that is not a function.
 *
 * @param where - the offset of the name.
 * @param name - the name being called.
 * @returns a failure describing the call.
 */
export function notAFunction(where: number, name: string): Failure<TuffError> {
  return fail(
    `'${name}' is not a function, so it cannot be called`,
    where,
    "Only a name declared with 'fn' can be called.",
    `Remove the parentheses after '${name}', or declare a function with 'fn'.`,
  );
}
