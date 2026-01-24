import type { Interpreter } from "./expressions/handlers";

export function handleDeclarationEnd(
  rest: string,
  closingIndex: number,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number {
  const afterDecl = rest.slice(closingIndex + 1).trim();
  if (afterDecl) {
    return interpreter(
      afterDecl,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }
  return 0;
}

export function makeDeclarationHandler(
  keyword: string,
  getClosingIndex: (rest: string) => number,
  storeDecl: (
    rest: string,
    closeIndex: number,
    typeMap: Map<string, number>,
  ) => void,
) {
  return function handleDeclaration(
    input: string,
    typeMap: Map<string, number>,
    scope: Map<string, number>,
    mutMap: Map<string, boolean>,
    uninitializedSet: Set<string>,
    unmutUninitializedSet: Set<string>,
    interpreter: Interpreter,
  ): { handled: boolean; result: number } {
    const s = input.trim();

    if (!s.startsWith(keyword + " ")) {
      return { handled: false, result: 0 };
    }

    const rest = s.slice(keyword.length).trim();
    const closeIndex = getClosingIndex(rest);
    if (closeIndex === -1) {
      return { handled: false, result: 0 };
    }

    storeDecl(rest, closeIndex, typeMap);

    return {
      handled: true,
      result: handleDeclarationEnd(
        rest,
        closeIndex,
        typeMap,
        scope,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
        interpreter,
      ),
    };
  };
}
