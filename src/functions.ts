import type { Value, FunctionValue, AST } from "./types";
import { Environment } from "./environment";
import { assertTypeMatches } from "./typecheck";

export function callFunction(
  fn: FunctionValue,
  args: Value[],
  evaluate: (ast: AST, env: Environment) => Value
): Value {
  if (args.length !== fn.params.length) {
    throw new Error(`Function ${fn.name} expects ${fn.params.length} args, got ${args.length}`);
  }
  const callEnv = (fn.closure as Environment).child();
  fn.params.forEach((param, i) => {
    callEnv.define(param.name, args[i]!, false);
  });
  const result = evaluate(fn.body, callEnv);
  if (fn.returnType) {
    assertTypeMatches(result, fn.returnType, "Return type mismatch");
  }
  return result;
}
