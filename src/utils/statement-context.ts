import type { Interpreter } from "../expressions/handlers";

export type StatementContext = {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  visMap: Map<string, boolean>;
  interpreter: Interpreter;
};
