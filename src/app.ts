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
import { extractTypeSize } from "./types";

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

  // Handle type alias declarations first - these are stored in typeMap with a special prefix
  if (s.startsWith("type ")) {
    const rest = s.slice(5).trim();
    const semiIndex = rest.indexOf(";");
    if (semiIndex !== -1) {
      const declStr = rest.slice(0, semiIndex);
      const eqIndex = declStr.indexOf("=");
      if (eqIndex !== -1) {
        const aliasName = declStr.slice(0, eqIndex).trim();
        const aliasType = declStr.slice(eqIndex + 1).trim();

        let typeSize = extractTypeSize(aliasType);

        // If it's an alias to another alias, resolve it
        if (typeSize === 0 && typeMap.has("__alias__" + aliasType)) {
          typeSize = typeMap.get("__alias__" + aliasType) || 0;
        }

        if (typeSize > 0) {
          // Store the alias
          typeMap.set("__alias__" + aliasName, typeSize);

          const afterDecl = rest.slice(semiIndex + 1).trim();
          if (afterDecl) {
            return interpretWithScope(
              afterDecl,
              scope,
              typeMap,
              mutMap,
              uninitializedSet,
              unmutUninitializedSet,
            );
          }
          return 0;
        }
      }
    }
  }

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
    if (e instanceof BreakException) {
      throw e;
    }
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
    !s.includes("&&")
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

export function interpret(input: string): number {
  return interpretWithScope(input, new Map(), new Map(), new Map());
}
