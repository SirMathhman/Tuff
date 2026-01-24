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
} from "./utils/app-handlers";
import { handleLambdaExpression } from "./handlers/lambda-expressions";
import {
  handleReferenceOperation,
  handleDereferenceOperation,
} from "./handlers/pointer-operations";
import { evaluateThisKeyword } from "./utils/this-keyword";
import { createArrayFromLiteral } from "./utils/array";

export function interpretWithScope(
  input: string,
  scope: Map<string, number> = new Map(),
  typeMap: Map<string, number> = new Map(),
  mutMap: Map<string, boolean> = new Map(),
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet = new Set<string>(),
): number {
  const s = input.trim();
  if (s === "") return 0;
  if (s === "this") return evaluateThisKeyword(scope);
  const literalArrayId = createArrayFromLiteral(s);
  if (literalArrayId !== undefined) return literalArrayId;
  const d = tryDeclarations({
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter: interpretWithScope as Interpreter,
  });
  if (d !== undefined) return d;
  const dr = handleVarDecl(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope as Interpreter,
    uninitializedSet,
    unmutUninitializedSet,
  );
  if (dr !== undefined) return dr;
  const mr = handleMatch(s, scope, typeMap, mutMap, (i, sc, tm, mm) =>
    interpretWithScope(i, sc, tm, mm, uninitializedSet, unmutUninitializedSet),
  );
  if (mr !== undefined) return mr;
  const lr = handleLoop({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (lr !== undefined) return lr;
  const wr = handleWhile({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (wr !== undefined) return wr;
  const fr = handleFor({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (fr !== undefined) return fr;
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
  const ir = handleIfExpression(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope,
  );
  if (ir !== undefined) return ir;
  const dereferenceAssignmentResult = handleDereferenceAssignment(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (dereferenceAssignmentResult !== undefined)
    return dereferenceAssignmentResult;
  const assignmentResult = handleVarAssignment(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (assignmentResult !== undefined) return assignmentResult;
  if (scope.has(s.trim())) return scope.get(s.trim())!;
  const fnCallResult = tryFunctionCalls({
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter: interpretWithScope as Interpreter,
  });
  if (fnCallResult !== undefined) return fnCallResult;
  const referenceResult = handleReferenceOperation(s, scope, mutMap);
  if (referenceResult !== undefined) return referenceResult;
  const dereferenceResult = handleDereferenceOperation(s, scope);
  if (dereferenceResult !== undefined) return dereferenceResult;
  const lambdaResult = handleLambdaExpression(s, typeMap);
  if (lambdaResult !== undefined) return lambdaResult;
  const unaryResult = tryUnaryOperation({
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter: interpretWithScope as Interpreter,
  });
  if (unaryResult !== undefined) return unaryResult;
  if (!mightNeedBinaryOp(s)) {
    return parseTypedNumber(s);
  }
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
