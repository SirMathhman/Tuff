import type {
  Interpreter,
  InterpreterContext,
  ScopeContext,
} from "../../types/interpreter";

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

export type BaseHandlerParams = Pick<
  FunctionCallParams,
  | "s"
  | "scope"
  | "typeMap"
  | "mutMap"
  | "uninitializedSet"
  | "unmutUninitializedSet"
  | "interpreter"
  | "visMap"
>;

export function toScopeContext(p: BaseHandlerParams): ScopeContext {
  return {
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    visMap: p.visMap,
    interpreter: p.interpreter,
  };
}
