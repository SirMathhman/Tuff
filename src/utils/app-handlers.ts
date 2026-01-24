import { handleTypeDeclaration } from "../types/type-declarations";
import { handleStructDeclaration } from "../types/structs";
import { handleFunctionDeclaration } from "../functions";
import { parseFunctionCall } from "../functions";
import { handleMethodCall } from "../handlers/method-call";
import { handleUnaryOperation } from "../expressions/unary-operation";
import type { FunctionCallParams } from "./function-call-params";

type Params = FunctionCallParams;

export function tryDeclarations(p: Params): number | undefined {
  const t = handleTypeDeclaration(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (t.handled) return t.result;
  const s = handleStructDeclaration(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (s.handled) return s.result;
  const f = handleFunctionDeclaration(
    p.s,
    p.typeMap,
    p.scope,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
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
