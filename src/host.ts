import { type Problem } from "./lexing";
import { checkTypedValue, isSuppressed } from "./scope";
import { type Cursor, type FunctionDef, type HostFunction, type Value } from "./types";
import { err, ok, type Result } from "./result";

/**
 * Calls a function the host supplies and checks its result against the function's declared return type.
 *
 * @param host - The host's implementation.
 * @param args - The argument values; each must be a number or a boolean.
 * @param start - Offset of the call, for error reporting.
 * @param fn - The declaration the call refers to.
 * @returns An Ok result with the host's result, or an Err result with the first problem found.
 */
export function callHostFunction(
  host: HostFunction,
  args: readonly Value[],
  start: number,
  fn: FunctionDef,
): Result<Value, Problem> {
  const plain: (number | boolean)[] = [];
  for (const arg of args) {
    if (typeof arg === "object") {
      return err({ offset: start, expected: "numbers or booleans as arguments to a host function" });
    }
    plain.push(arg);
  }
  const result = host(...plain);
  const { returnType = "" } = fn;
  if (returnType === "Void") {
    return ok(0);
  }
  if (typeof result !== "number" && typeof result !== "boolean") {
    return err({ offset: start, expected: "a number or boolean from the host function" });
  }
  const problem = checkTypedValue(result, start, returnType);
  return problem === undefined ? ok(result) : err(problem);
}

/**
 * Calls an extern function from a call expression. A call in a branch that is not taken does nothing.
 *
 * @param cursor - The parse state.
 * @param name - The function's name, for error reporting.
 * @param start - Offset of the call, for error reporting.
 * @param args - The argument values.
 * @param fn - The extern declaration being called.
 * @returns An Ok result with the host's result (or a placeholder for a Void call), or an Err result.
 */
export function callExternal(
  cursor: Cursor,
  name: string,
  start: number,
  args: readonly Value[],
  fn: FunctionDef,
): Result<Value, Problem> {
  if (isSuppressed(cursor)) {
    return ok(0);
  }
  const { host } = fn;
  if (host === undefined) {
    return err({ offset: start, expected: 'a host function named "' + name + '" to be provided' });
  }
  return callHostFunction(host, args, start, fn);
}
