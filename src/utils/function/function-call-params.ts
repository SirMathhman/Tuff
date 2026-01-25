import type {
  Interpreter,
  InterpreterContext,
} from "../../expressions/handlers";

type DeclarationHandler = (
  input: string,
  ctx: InterpreterContext,
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
  visMap: Map<string, boolean>;
  moduleHandler?: DeclarationHandler;
  objectHandler?: DeclarationHandler;
};
