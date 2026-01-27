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
import {
  toInterpreterContext,
  toScopeContext,
  type BaseHandlerParams,
} from "../function/function-call-params";
import type { HandlerParams } from "../../loops/types";

type Params = FunctionCallParams;

function toLoopHandlerParams(p: Params): HandlerParams {
  return {
    s: p.s,
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    interpreter: p.interpreter,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    visMap: p.visMap,
  };
}

function toBaseHandlerParams(p: Params) {
  const base: BaseHandlerParams = {
    s: p.s,
    scope: p.scope,
    typeMap: p.typeMap,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    interpreter: p.interpreter,
    visMap: p.visMap,
    movedSet: p.movedSet,
  };
  return base;
}

export function buildInterpreterParams(
  p: {
    s: string;
    interpreter: Interpreter;
  } & Omit<InterpreterContext, "visMap"> & { visMap?: Map<string, boolean> },
): Params {
  const visMap = p.visMap ?? new Map();
  return {
    s: p.s,
    typeMap: p.typeMap,
    scope: p.scope,
    mutMap: p.mutMap,
    uninitializedSet: p.uninitializedSet,
    unmutUninitializedSet: p.unmutUninitializedSet,
    interpreter: p.interpreter,
    visMap,
    movedSet: p.movedSet,
    moduleHandler: getModuleDeclarationHandler(p.interpreter),
    objectHandler: getObjectDeclarationHandler(p.interpreter),
  };
}

export function tryDeclarations(p: Params): number | undefined {
  const ctx: InterpreterContext = toInterpreterContext(toBaseHandlerParams(p));

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
  const method = handleMethodCall(toBaseHandlerParams(p));
  if (method !== undefined) return method;
  return parseFunctionCall(p);
}

export function tryUnaryOperation(p: Params): number | undefined {
  return handleUnaryOperation(toBaseHandlerParams(p));
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
  let result = handleMatch({ s: p.s, ...toScopeContext(p) });
  if (result !== undefined) return result;
  const ctx = toLoopHandlerParams(p);
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
  const base = toBaseHandlerParams(p);
  const result = handleDereferenceAssignment(base);
  if (result !== undefined) return result;
  return handleVarAssignment(base);
}

export function tryExpressions(p: Params): number | undefined {
  let result = handleReferenceOperation(
    p.s,
    p.scope,
    p.mutMap,
    false,
    p.typeMap,
  );
  if (result !== undefined) return result;
  result = handleDereferenceOperation(p.s, p.scope);
  if (result !== undefined) return result;
  result = handleLambdaExpression(p.s, p.typeMap);
  if (result !== undefined) return result;
  return handleModuleAccess({
    s: p.s,
    typeMap: p.typeMap,
    interpreter: p.interpreter,
  });
}
