import type { Interpreter, InterpreterContext } from "./expressions/handlers";

export function handleDeclarationEnd(
  rest: string,
  closingIndex: number,
  ctx: InterpreterContext,
  interpreter: Interpreter,
): number {
  const afterDecl = rest.slice(closingIndex + 1).trim();
  if (afterDecl) {
    return interpreter(
      afterDecl,
      ctx.scope,
      ctx.typeMap,
      ctx.mutMap,
      ctx.uninitializedSet,
      ctx.unmutUninitializedSet,
      ctx.visMap,
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
    visMap: Map<string, boolean>,
    isPublic: boolean,
  ) => void,
) {
  return function handleDeclaration(
    input: string,
    ctx: InterpreterContext,
    interpreter: Interpreter,
  ): { handled: boolean; result: number } {
    const s = input.trim();

    // Check for visibility modifier 'out'
    const isPublic = s.startsWith("out ");
    const stripped = isPublic ? s.slice(4).trim() : s;

    if (!stripped.startsWith(keyword + " ")) {
      return { handled: false, result: 0 };
    }

    const rest = stripped.slice(keyword.length).trim();
    const closeIndex = getClosingIndex(rest);
    if (closeIndex === -1) {
      return { handled: false, result: 0 };
    }

    storeDecl(rest, closeIndex, ctx.typeMap, ctx.visMap, isPublic);

    return {
      handled: true,
      result: handleDeclarationEnd(rest, closeIndex, ctx, interpreter),
    };
  };
}
