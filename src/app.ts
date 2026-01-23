import { handleVarDecl, evaluateGroupedExpressionsWithScope } from "./scope";
import { handleMatch } from "./match";
import { handleLoop, BreakException, handleBreak } from "./loop";
import { findOperatorIndex, performBinaryOp } from "./operators";
import { parseTypedNumber, extractTypedInfo } from "./parser";

export function interpretWithScope(
  input: string,
  scope: Map<string, number> = new Map(),
  typeMap: Map<string, number> = new Map(),
  mutMap: Map<string, boolean> = new Map(),
  uninitializedSet: Set<string> = new Set(),
): number {
  const s = input.trim();
  if (s === "") return 0;

  const declResult = handleVarDecl(
    s,
    scope,
    typeMap,
    mutMap,
    interpretWithScope,
    uninitializedSet,
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

  const loopResult = handleLoop(s, scope, typeMap, mutMap, interpretWithScope);
  if (loopResult !== undefined) return loopResult;

  try {
    handleBreak(s, scope, typeMap, mutMap, interpretWithScope);
    // If handleBreak returns, it means the string doesn't start with "break"
  } catch (e) {
    if (e instanceof BreakException) {
      throw e;
    }
    // If it's not a BreakException, continue to other handlers
  }

  if (s.indexOf("if ") === 0) {
    const cIdx = s.indexOf(")");
    if (cIdx > 0) {
      const cond = interpretWithScope(
        s.slice(4, cIdx),
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
      );
      let elseIdx = -1;
      let ifDepth = 0;
      let parenDepth = 0;
      let braceDepth = 0;

      // Find the matching "else" for this "if"
      for (let i = cIdx + 1; i < s.length; i++) {
        if (s[i] === "(") parenDepth++;
        else if (s[i] === ")") parenDepth--;
        else if (s[i] === "{") braceDepth++;
        else if (s[i] === "}") braceDepth--;
        else if (
          parenDepth === 0 &&
          braceDepth === 0 &&
          s.slice(i, i + 5) === " else"
        ) {
          if (ifDepth === 0) {
            elseIdx = i;
            break;
          }
          ifDepth--;
        } else if (
          parenDepth === 0 &&
          braceDepth === 0 &&
          s.slice(i, i + 3) === "if " &&
          (i === 0 || " \t\n".includes(s.charAt(i - 1)))
        ) {
          ifDepth++;
        }
      }

      if (elseIdx > 0) {
        const thenStr = s.slice(cIdx + 1, elseIdx).trim(),
          elseStr = s.slice(elseIdx + 6).trim();
        return cond !== 0
          ? interpretWithScope(
              thenStr,
              scope,
              typeMap,
              mutMap,
              uninitializedSet,
            )
          : interpretWithScope(
              elseStr,
              scope,
              typeMap,
              mutMap,
              uninitializedSet,
            );
      } else {
        // No else clause - just handle the then part
        const thenStr = s.slice(cIdx + 1).trim();
        if (cond !== 0) {
          return interpretWithScope(
            thenStr,
            scope,
            typeMap,
            mutMap,
            uninitializedSet,
          );
        }
        return 0; // If condition is false and no else, return 0
      }
    }
  }

  const eqIdx = s.indexOf("=");
  if (
    eqIdx > 0 &&
    s[eqIdx + 1] !== "=" &&
    scope.has(s.slice(0, eqIdx).trim())
  ) {
    const lhs = s.slice(0, eqIdx).trim(),
      semiIdx = s.indexOf(";", eqIdx);
    if (!mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
    if (semiIdx !== -1) {
      const newValue = interpretWithScope(
        s.slice(eqIdx + 1, semiIdx).trim(),
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
      );
      scope.set(lhs, newValue);
      // If this variable was uninitialized, remove it from the uninitialized set and mutMap
      // after the first assignment (so it becomes immutable)
      if (uninitializedSet.has(lhs)) {
        uninitializedSet.delete(lhs);
        mutMap.delete(lhs);
      }
      return interpretWithScope(
        s.slice(semiIdx + 1).trim(),
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
      );
    }
  }

  if (scope.has(s.trim())) return scope.get(s.trim())!;
  if (
    !s.includes("+") &&
    !s.includes("-") &&
    !s.includes("*") &&
    !s.includes("/") &&
    !s.includes("(") &&
    !s.includes("{") &&
    !s.includes("[")
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
      );
  }
  const { index: opIndex, operator: op } = findOperatorIndex(s);
  if (opIndex === -1) return parseTypedNumber(s);
  return performBinaryOp(
    interpretWithScope(
      s.slice(0, opIndex).trim(),
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
    ),
    op,
    interpretWithScope(
      s.slice(opIndex + 1).trim(),
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
    ),
    extractTypedInfo(s.slice(0, opIndex).trim()),
    s.slice(opIndex + 1).trim(),
  );
}

export function interpret(input: string): number {
  return interpretWithScope(input, new Map(), new Map(), new Map());
}
