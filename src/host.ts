import { type Problem } from "./lexing";
import { checkTypedValue } from "./scope";
import { type FunctionDef, type HostFunction, type Value } from "./types";
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
  const problem = checkTypedValue(result, start, returnType);
  return problem === undefined ? ok(result) : err(problem);
}
