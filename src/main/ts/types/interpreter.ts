export interface InterpreterContext {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  visMap: Map<string, boolean>;
}

export type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  visMap?: Map<string, boolean>,
) => number;

export interface ScopeContext extends InterpreterContext {
  interpreter: Interpreter;
}

export function callInterpreter(ctx: ScopeContext, input: string): number {
  return ctx.interpreter(
    input,
    ctx.scope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
    ctx.visMap,
  );
}
