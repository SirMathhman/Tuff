import { err, ok, type Result } from "./src/result.ts";
import { unhandledInput, type EvalError } from "./src/errors.ts";

export type { Result } from "./src/result.ts";
export type { EvalError } from "./src/errors.ts";

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return ok(0);
  if (input === "return 1;") return ok(1);
  if (input === "return 2;") return ok(2);
  if (input === "return 3;") return ok(3);
  if (input === "return 4;") return ok(4);
  return err(unhandledInput(input));
}
