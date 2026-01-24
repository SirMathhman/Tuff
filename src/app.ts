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
import { handleBinaryOperation } from "./expressions/binary-operation";
import { parseTypedNumber } from "./parser";
import { handleTypeDeclaration } from "./types/type-declarations";
import { handleStructDeclaration } from "./types/structs";
import { handleFunctionDeclaration, parseFunctionCall } from "./functions";

export function interpretWithScope(
  input: string,
  scope: Map<string, number> = new Map(),
  typeMap: Map<string, number> = new Map(),
  mutMap: Map<string, boolean> = new Map(),
  uninitializedSet: Set<string> = new Set(),
  unmutUninitializedSet: Set<string> = new Set(),
): number {
  const s = input.trim();
  if (s === "") return 0;

  const typeDecl = handleTypeDeclaration(
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (typeDecl.handled) return typeDecl.result;
  const structDecl = handleStructDeclaration(
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (structDecl.handled) return structDecl.result;
  const fnDecl = handleFunctionDeclaration(
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (fnDecl.handled) return fnDecl.result;
  const declResult = handleVarDecl(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope as Interpreter,
    uninitializedSet,
    unmutUninitializedSet,
  );
  if (declResult !== undefined) return declResult;
  const matchResult = handleMatch(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope,
  );
  if (matchResult !== undefined) return matchResult;
  const loopResult = handleLoop({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (loopResult !== undefined) return loopResult;
  const whileResult = handleWhile({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (whileResult !== undefined) return whileResult;
  const forResult = handleFor({
    s,
    scope,
    typeMap,
    mutMap,
    interpreter: interpretWithScope,
    uninitializedSet,
    unmutUninitializedSet,
  });
  if (forResult !== undefined) return forResult;
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
  const ifResult = handleIfExpression(
    s,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (ifResult !== undefined) return ifResult;
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
  const fnCallResult = parseFunctionCall(
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpretWithScope as Interpreter,
  );
  if (fnCallResult !== undefined) return fnCallResult;
  if (
    !s.includes("+") &&
    !s.includes("-") &&
    !s.includes("*") &&
    !s.includes("/") &&
    !s.includes("<") &&
    !s.includes(">") &&
    !s.includes("=") &&
    !s.includes("!") &&
    !s.includes("(") &&
    !s.includes("{") &&
    !s.includes("[") &&
    !s.includes(" is ") &&
    !s.includes("&&") &&
    !s.includes(".")
  ) {
    return parseTypedNumber(s);
  }
  const trimmedS = s.trim();
  const isMatch =
    trimmedS.startsWith("match") &&
    trimmedS.slice(5).trimStart().startsWith("(");
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
