import type { Interpreter } from "../expressions/handlers";

export interface HandlerParams {
  s: string;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
  uninitializedSet?: Set<string>;
  unmutUninitializedSet?: Set<string>;
  visMap?: Map<string, boolean>;
}

export type LoopCore = {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  visMap: Map<string, boolean>;
};

export function getLoopCore(params: HandlerParams): LoopCore {
  return {
    scope: params.scope,
    typeMap: params.typeMap,
    mutMap: params.mutMap,
    interpreter: params.interpreter,
    uninitializedSet: params.uninitializedSet ?? new Set(),
    unmutUninitializedSet: params.unmutUninitializedSet ?? new Set(),
    visMap: params.visMap ?? new Map(),
  };
}
