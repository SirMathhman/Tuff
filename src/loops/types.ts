import type { Interpreter } from "../expressions/handlers";

export interface HandlerParams {
  s: string;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
  uninitializedSet?: Set<string>;
  unmutUninitializedSet?: Set<string>;
}
