import { handleTypeDeclaration } from "../types/type-declarations";
import { handleStructDeclaration } from "../types/structs";
import { handleFunctionDeclaration } from "../functions";
import { parseFunctionCall } from "../functions";
import { handleMethodCall } from "../handlers/access/method-call";
import { handleUnaryOperation } from "../expressions/operators/unary-operation";
import { getModuleDeclarationHandler } from "../types/modules";
import { getObjectDeclarationHandler } from "../types/objects";
import type { FunctionCallParams } from "./function-call-params";
import type { Interpreter, InterpreterContext } from "../expressions/handlers";

type Params = FunctionCallParams;

export function buildInterpreterParams(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
  visMap: Map<string, boolean> = new Map(),
): Params {
  return {
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter,
    visMap,
    moduleHandler: getModuleDeclarationHandler(interpreter),
    objectHandler: getObjectDeclarationHandler(interpreter),
  };
}

export function tryDeclarations(p: Params): number | undefined {
  const ctx: InterpreterContext = {
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    visMap: p.visMap,
  };

  if (p.moduleHandler) {
    const m = p.moduleHandler(p.s, ctx, p.interpreter);
    if (m.handled) return m.result;
  }
  if (p.objectHandler) {
    const o = p.objectHandler(p.s, ctx, p.interpreter);
    if (o.handled) return o.result;
  }
  const t = handleTypeDeclaration(p.s, ctx, p.interpreter);
  if (t.handled) return t.result;
  const s = handleStructDeclaration(p.s, ctx, p.interpreter);
  if (s.handled) return s.result;
  const f = handleFunctionDeclaration(p.s, ctx, p.interpreter);
  if (f.handled) return f.result;
  return undefined;
}

export function tryFunctionCalls(p: Params): number | undefined {
  const method = handleMethodCall(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (method !== undefined) return method;
  return parseFunctionCall(p);
}

export function tryUnaryOperation(p: Params): number | undefined {
  return handleUnaryOperation(
    p.s,
    p.scope,
    p.typeMap,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
}

export function mightNeedBinaryOp(s: string): boolean {
  return (
    s.includes("+") ||
    s.includes("-") ||
    s.includes("*") ||
    s.includes("/") ||
    s.includes("<") ||
    s.includes(">") ||
    s.includes("=") ||
    s.includes("!") ||
    s.includes("(") ||
    s.includes("{") ||
    s.includes("[") ||
    s.includes(" is ") ||
    s.includes("&&") ||
    s.includes(".")
  );
}
