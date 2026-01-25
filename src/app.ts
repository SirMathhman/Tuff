import { handleVarDecl } from "./scope";
import { evaluateGroupedExpressionsWithScope } from "./expressions/grouped-expressions";
import { handleIfExpression, type Interpreter } from "./expressions/handlers";
import { handleBinaryOperation } from "./expressions/operators/binary-operation";
import { parseTypedNumber } from "./parser";
import {
  tryDeclarations,
  tryFunctionCalls,
  tryUnaryOperation,
  mightNeedBinaryOp,
  buildInterpreterParams,
  tryControlFlow,
  tryAssignments,
  tryExpressions,
} from "./utils/app-handlers";
import { evaluateThisKeyword } from "./utils/this-keyword";
import { createArrayFromLiteral } from "./utils/array";

function tryBasicHandlers(
  s: string,
  p: ReturnType<typeof buildInterpreterParams>,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  visMap: Map<string, boolean>,
): number | undefined {
  let result = tryDeclarations(p);
  if (result !== undefined) return result;
  result = handleVarDecl(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope as Interpreter,
    uninitializedSet,
    unmutUninitializedSet,
    visMap,
  );
  if (result !== undefined) return result;
  result = tryControlFlow(p);
  if (result !== undefined) return result;
  result = handleIfExpression(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope,
  );
  return result;
}

function tryAdvancedHandlers(
  s: string,
  p: ReturnType<typeof buildInterpreterParams>,
  scope: Map<string, number>,
): number | undefined {
  let result = tryAssignments(p);
  if (result !== undefined) return result;
  if (scope.has(s.trim())) return scope.get(s.trim())!;
  result = tryFunctionCalls(p);
  if (result !== undefined) return result;
  result = tryExpressions(p);
  if (result !== undefined) return result;
  return tryUnaryOperation(p);
}

function handleGroupedOrBinaryOp(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
): number {
  if (!mightNeedBinaryOp(s)) return parseTypedNumber(s);
  const isMatch =
    s.startsWith("match") && s.slice(5).trimStart().startsWith("(");
  if ((s.includes("(") || s.includes("{") || s.includes("[")) && !isMatch) {
    const processed = evaluateGroupedExpressionsWithScope(
      s,
      scope,
      typeMap,
      mutMap,
      interpretWithScope,
    );
    if (processed !== s)
      return interpretWithScope(
        processed,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      );
  }
  return handleBinaryOperation({
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter: interpretWithScope as Interpreter,
    visMap: new Map(),
  });
}

export function interpretWithScope(
  input: string,
  scope: Map<string, number> = new Map(),
  typeMap: Map<string, number> = new Map(),
  mutMap: Map<string, boolean> = new Map(),
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet = new Set<string>(),
  visMap: Map<string, boolean> = new Map(),
): number {
  const s = input.trim();
  if (s === "") return 0;
  if (s === "this") return evaluateThisKeyword(scope);
  const literalArrayId = createArrayFromLiteral(s);
  if (literalArrayId !== undefined) return literalArrayId;
  const p = buildInterpreterParams(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
    visMap,
  );
  let result = tryBasicHandlers(
    s,
    p,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    visMap,
  );
  if (result !== undefined) return result;
  result = tryAdvancedHandlers(s, p, scope);
  if (result !== undefined) return result;
  return handleGroupedOrBinaryOp(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}
