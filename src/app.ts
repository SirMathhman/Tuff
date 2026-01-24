import { handleVarDecl } from "./scope";
import { evaluateGroupedExpressionsWithScope } from "./expressions/grouped-expressions";
import { handleMatch } from "./match";
import { handleLoop, BreakException, handleBreak } from "./loops/loop";
import { handleWhile } from "./loops/while";
import { handleFor } from "./loops/for";
import {
  handleIfExpression,
  handleVarAssignment,
  type Interpreter,
} from "./expressions/handlers";
import { handleDereferenceAssignment } from "./handlers/dereference-assignment";
import { handleBinaryOperation } from "./expressions/binary-operation";
import { parseTypedNumber } from "./parser";
import {
  tryDeclarations,
  tryFunctionCalls,
  tryUnaryOperation,
  mightNeedBinaryOp,
  buildInterpreterParams,
} from "./utils/app-handlers";
import { handleLambdaExpression } from "./handlers/lambda-expressions";
import {
  handleReferenceOperation,
  handleDereferenceOperation,
} from "./handlers/pointer-operations";
import { evaluateThisKeyword } from "./utils/this-keyword";
import { createArrayFromLiteral } from "./utils/array";
import { handleModuleAccess } from "./handlers/module-access";

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
  result = handleMatch(s, scope, typeMap, mutMap, (i, sc, tm, mm) =>
    interpretWithScope(i, sc, tm, mm, uninitializedSet, unmutUninitializedSet, visMap),
  );
  if (result !== undefined) return result;
  result = handleLoop({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (result !== undefined) return result;
  result = handleWhile({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (result !== undefined) return result;
  result = handleFor({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (result !== undefined) return result;
  try {
    handleBreak({
      s,
      scope,
      typeMap,
      mutMap,
      interpreter: interpretWithScope,
      uninitializedSet,
      unmutUninitializedSet,
    });
  } catch (e) {
    if (e instanceof BreakException) throw e;
  }
  result = handleIfExpression(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope,
  );
  if (result !== undefined) return result;
  result = handleDereferenceAssignment(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (result !== undefined) return result;
  result = handleVarAssignment(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (result !== undefined) return result;
  if (scope.has(s.trim())) return scope.get(s.trim())!;
  result = tryFunctionCalls(p);
  if (result !== undefined) return result;
  result = handleReferenceOperation(s, scope, mutMap);
  if (result !== undefined) return result;
  result = handleDereferenceOperation(s, scope);
  if (result !== undefined) return result;
  result = handleLambdaExpression(s, typeMap);
  if (result !== undefined) return result;
  result = tryUnaryOperation(p);
  if (result !== undefined) return result;
  result = handleModuleAccess(s, scope, typeMap, mutMap, interpretWithScope);
  if (result !== undefined) return result;
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
  return handleBinaryOperation(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
}
