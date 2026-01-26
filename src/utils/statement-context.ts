import type { Interpreter, InterpreterContext } from "../types/interpreter";

export type StatementContext = InterpreterContext & {
  interpreter: Interpreter;
};

export function interpretRest(rest: string, ctx: StatementContext): number {
  const trimmed = rest.trim();
  return trimmed
    ? ctx.interpreter(
        trimmed,
        ctx.scope,
        ctx.typeMap,
        ctx.mutMap,
        ctx.uninitializedSet,
        ctx.unmutUninitializedSet,
        ctx.visMap,
      )
    : 0;
}

export function interpretAfterSemicolon(
  input: string,
  semicolonIndex: number,
  ctx: StatementContext,
): number {
  if (semicolonIndex === -1) return 0;
  return interpretRest(input.slice(semicolonIndex + 1), ctx);
}
