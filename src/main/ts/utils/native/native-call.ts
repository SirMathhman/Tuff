import { parseArguments } from "../function/parse-arguments";
import type { BaseHandlerParams } from "../function/function-call-params";

export function handleNativeFunctionCall(
  p: {
    actualFnName: string;
    argsStr: string;
    rest: string;
  } & Pick<
    BaseHandlerParams,
    | "scope"
    | "typeMap"
    | "mutMap"
    | "uninitializedSet"
    | "unmutUninitializedSet"
    | "interpreter"
  >,
): number {
  const nativeFunc =
    typeof globalThis !== "undefined"
      ? (globalThis as Record<string, unknown>)[`__native__${p.actualFnName}`]
      : undefined;

  const argParts = parseArguments(p.argsStr);
  const args: number[] = argParts.map((argStr) =>
    p.interpreter(
      argStr,
      p.scope,
      p.typeMap,
      p.mutMap,
      p.uninitializedSet,
      p.unmutUninitializedSet,
    ),
  );
  const result = (nativeFunc as (...args: number[]) => number)(...args);
  if (typeof result !== "number") {
    throw new Error(`native function ${p.actualFnName} must return a number`);
  }
  if (p.rest === "") return result;
  return p.interpreter(
    result.toString() + p.rest,
    p.scope,
    p.typeMap,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
  );
}
