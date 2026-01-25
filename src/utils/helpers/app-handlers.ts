import { handleTypeDeclaration } from "../../types/type-declarations";
import { handleStructDeclaration } from "../../types/structs";
import { handleFunctionDeclaration } from "../../functions";
import { parseFunctionCall } from "../../functions";
import { handleMethodCall } from "../../handlers/access/method-call";
import { handleUnaryOperation } from "../../expressions/operators/unary-operation";
import { getModuleDeclarationHandler } from "../../types/modules";
import { getObjectDeclarationHandler } from "../../types/objects";
import type { FunctionCallParams } from "../function/function-call-params";
import type {
  Interpreter,
  InterpreterContext,
} from "../../expressions/handlers";
import { handleMatch } from "../../match";
import { handleLoop, handleBreak, isBreakException } from "../../loops/loop";
import { handleWhile } from "../../loops/while";
import { handleFor } from "../../loops/for";
import { handleDereferenceAssignment } from "../../handlers/variables/dereference-assignment";
import { handleVarAssignment } from "../../expressions/handlers";
import { handleLambdaExpression } from "../../handlers/functions/lambda-expressions";
import {
  handleReferenceOperation,
  handleDereferenceOperation,
} from "../../handlers/access/pointer-operations";
import { handleModuleAccess } from "../../handlers/access/module-access";

type Params = FunctionCallParams;
type LoopCtx = {
  s: string;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
};
function buildLoopCtx(p: Params): LoopCtx {
  return {
    s: p.s,
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    interpreter: p.interpreter,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
  };
}

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
  return handleUnaryOperation({
    s: p.s,
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    interpreter: p.interpreter,
    visMap: p.visMap,
  });
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

export function tryControlFlow(p: Params): number | undefined {
  let result = handleMatch(p.s, p.scope, p.typeMap, p.mutMap, (i, sc, tm, mm) =>
    p.interpreter(i, sc, tm, mm, p.uninitializedSet, p.unmutUninitializedSet),
  );
  if (result !== undefined) return result;
  const ctx = buildLoopCtx(p);
  result = handleLoop(ctx);
  if (result !== undefined) return result;
  result = handleWhile(ctx);
  if (result !== undefined) return result;
  result = handleFor(ctx);
  if (result !== undefined) return result;
  try {
    handleBreak(ctx);
  } catch (e) {
    if (isBreakException(e)) throw e;
  }
  return undefined;
}

export function tryAssignments(p: Params): number | undefined {
  const result = handleDereferenceAssignment(
    p.s,
    p.scope,
    p.typeMap,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.interpreter,
  );
  if (result !== undefined) return result;
  return handleVarAssignment({
    s: p.s,
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    interpreter: p.interpreter,
    visMap: p.visMap,
  });
}

export function tryExpressions(p: Params): number | undefined {
  let result = handleReferenceOperation(p.s, p.scope, p.mutMap);
  if (result !== undefined) return result;
  result = handleDereferenceOperation(p.s, p.scope);
  if (result !== undefined) return result;
  result = handleLambdaExpression(p.s, p.typeMap);
  if (result !== undefined) return result;
  return handleModuleAccess(p.s, p.scope, p.typeMap, p.mutMap, p.interpreter);
}
