import { handleVarDecl } from "../scope";
import { evaluateGroupedExpressionsWithScope } from "../expressions/grouped-expressions";
import { handleIfExpression, type Interpreter } from "../expressions/handlers";
import { handleBinaryOperation } from "../expressions/operators/binary-operation";
import { parseTypedNumber } from "../parser";
import {
  tryDeclarations,
  tryFunctionCalls,
  tryUnaryOperation,
  mightNeedBinaryOp,
  buildInterpreterParams,
  tryControlFlow,
  tryAssignments,
  tryExpressions,
} from "../utils/helpers/app-handlers";
import { evaluateThisKeyword } from "../utils/this-keyword";
import { createArrayFromLiteral } from "../utils/array";
import type { BaseHandlerParams } from "../utils/function/function-call-params";
import { toScopeContext } from "../utils/function/function-call-params";

function tryBasicHandlers(
  p: ReturnType<typeof buildInterpreterParams>,
): number | undefined {
  let result = tryDeclarations(p);
  if (result !== undefined) return result;
  result = handleVarDecl(
    p.s,
    p.scope,
    p.typeMap,
    p.mutMap,
    interpretWithScope as Interpreter,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.visMap,
    p.movedSet,
  );
  if (result !== undefined) return result;
  result = tryControlFlow(p);
  if (result !== undefined) return result;
  result = handleIfExpression({ s: p.s, ...toScopeContext(p) });
  return result;
}

function tryAdvancedHandlers(
  p: ReturnType<typeof buildInterpreterParams>,
): number | undefined {
  let result = tryAssignments(p);
  if (result !== undefined) return result;
  const varName = p.s.trim();
  if (p.scope.has(varName)) {
    if (p.movedSet?.has(varName)) {
      throw new Error(`variable '${varName}' has been moved`);
    }
    return p.scope.get(varName)!;
  }
  result = tryFunctionCalls(p);
  if (result !== undefined) return result;
  result = tryExpressions(p);
  if (result !== undefined) return result;
  return tryUnaryOperation(p);
}

function handleGroupedOrBinaryOp(
  p: Pick<
    BaseHandlerParams,
    | "s"
    | "scope"
    | "typeMap"
    | "mutMap"
    | "uninitializedSet"
    | "unmutUninitializedSet"
    | "interpreter"
    | "visMap"
    | "movedSet"
  >,
): number {
  if (!mightNeedBinaryOp(p.s)) return parseTypedNumber(p.s);
  const isMatch =
    p.s.startsWith("match") && p.s.slice(5).trimStart().startsWith("(");
  if (
    (p.s.includes("(") || p.s.includes("{") || p.s.includes("[")) &&
    !isMatch
  ) {
    const processed = evaluateGroupedExpressionsWithScope({
      s: p.s,
      scope: p.scope,
      typeMap: p.typeMap,
      mutMap: p.mutMap,
      interpreter: interpretWithScope,
    });
    if (processed !== p.s)
      return interpretWithScope(
        processed,
        p.scope,
        p.typeMap,
        p.mutMap,
        p.uninitializedSet,
        p.unmutUninitializedSet,
        p.visMap,
        p.movedSet,
      );
  }
  return handleBinaryOperation(p);
}

export function interpretWithScope(
  input: string,
  scope: Map<string, number> = new Map(),
  typeMap: Map<string, number> = new Map(),
  mutMap: Map<string, boolean> = new Map(),
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet = new Set<string>(),
  visMap: Map<string, boolean> = new Map(),
  movedSet: Set<string> = new Set(),
): number {
  const s = input.trim();
  if (s === "") return 0;
  if (s === "this") return evaluateThisKeyword(scope);
  const literalArrayId = createArrayFromLiteral(s);
  if (literalArrayId !== undefined) return literalArrayId;
  const p = buildInterpreterParams({
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter: interpretWithScope as Interpreter,
    visMap,
    movedSet,
  });
  let result = tryBasicHandlers(p);
  if (result !== undefined) return result;
  result = tryAdvancedHandlers(p);
  if (result !== undefined) return result;
  return handleGroupedOrBinaryOp(p);
}
