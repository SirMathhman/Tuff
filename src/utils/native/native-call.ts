import type { Interpreter } from "../../expressions/handlers";
import { parseArguments } from "../function/parse-arguments";

export function handleNativeFunctionCall(
  actualFnName: string,
  argsStr: string,
  rest: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number {
  const nativeFunc =
    typeof globalThis !== "undefined"
      ? (globalThis as Record<string, unknown>)[`__native__${actualFnName}`]
      : undefined;

  const argParts = parseArguments(argsStr);
  const args: number[] = argParts.map((argStr) =>
    interpreter(
      argStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    ),
  );
  const result = (nativeFunc as (...args: number[]) => number)(...args);
  if (typeof result !== "number") {
    throw new Error(`native function ${actualFnName} must return a number`);
  }
  if (rest === "") return result;
  return interpreter(
    result.toString() + rest,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}
