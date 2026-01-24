import type { Interpreter } from "../expressions/handlers";

type DeclarationHandler = (
  input: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
) => { handled: boolean; result: number };

export type FunctionCallParams = {
  s: string;
  typeMap: Map<string, number>;
  scope: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  interpreter: Interpreter;
  moduleHandler?: DeclarationHandler;
  objectHandler?: DeclarationHandler;
};
