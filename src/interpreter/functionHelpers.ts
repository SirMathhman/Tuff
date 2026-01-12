import type { FunctionValue, EnvItem, Env } from "./types";
import { handleYieldValue } from "./statements";
import { evalBlock } from "./statements";
import { computeArgTypeFromExpr, isTypeCompatible } from "./signatures";

export function runFunctionWithBindings(
  func: FunctionValue,
  bindings: Array<[string, unknown]>
): number {
  const callEnv = new Map<string, EnvItem>(func.env);
  for (const [k, v] of bindings)
    callEnv.set(k, {
      value: v as EnvItem["value"],
      mutable: false,
    } as EnvItem);
  return handleYieldValue(() => evalBlock(func.body, callEnv, true)) as number;
}

export function checkMethodArgumentTypes(
  paramTypes: string[] | undefined,
  args: string[],
  env?: Env,
  offset = 0
) {
  if (paramTypes === undefined) return;
  for (let i = 0; i < args.length; i++) {
    const expected = paramTypes[i + offset];
    const argType = computeArgTypeFromExpr(args[i], env);
    if (!isTypeCompatible(expected, argType, env))
      throw new Error("Argument type mismatch");
  }
}

export function validateConcreteParamTypes(
  concreteParamTypes: string[] | undefined,
  args: string[],
  env?: Env
) {
  if (!concreteParamTypes) return;
  for (let i = 0; i < concreteParamTypes.length; i++) {
    const expected = concreteParamTypes[i];
    const argExpr = args[i];
    const argType = computeArgTypeFromExpr(argExpr, env);
    if (!isTypeCompatible(expected, argType, env))
      throw new Error("Argument type mismatch");
  }
}
