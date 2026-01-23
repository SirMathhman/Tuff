import { BreakException } from "./loop";
import { findClosingParenthesis, parseLoopBody } from "./helpers";
import type { HandlerParams } from "./types";

interface RangeInfo {
  start: number;
  end: number;
}

function parseRange(rangeStr: string): RangeInfo | undefined {
  const trimmed = rangeStr.trim();
  const dotsIdx = trimmed.indexOf("..");
  if (dotsIdx === -1) return undefined;

  const startStr = trimmed.slice(0, dotsIdx).trim();
  const endStr = trimmed.slice(dotsIdx + 2).trim();

  const start = Number(startStr);
  const end = Number(endStr);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;

  return { start, end };
}

export function handleFor(params: HandlerParams): number | undefined {
  const {
    s,
    scope,
    typeMap,
    mutMap,
    interpreter,
    uninitializedSet = new Set(),
    unmutUninitializedSet = new Set(),
  } = params;
  const trimmed = s.trim();
  if (!trimmed.startsWith("for")) return undefined;

  let idx = 3; // Position after "for"

  // Skip whitespace
  while (idx < trimmed.length && trimmed[idx] === " ") idx++;

  if (idx >= trimmed.length || trimmed[idx] !== "(") return undefined;
  idx++; // Skip opening paren

  // Find "in" keyword
  let inIdx = -1;
  for (let i = idx; i < trimmed.length - 1; i++) {
    if (
      trimmed[i] === " " &&
      trimmed[i + 1] === "i" &&
      trimmed[i + 2] === "n" &&
      (i + 3 >= trimmed.length ||
        trimmed[i + 3] === " " ||
        trimmed[i + 3] === "(")
    ) {
      inIdx = i + 1;
      break;
    }
  }

  if (inIdx === -1) return undefined;

  const varDeclStr = trimmed.slice(idx, inIdx).trim();

  // Skip past "in" and whitespace
  idx = inIdx + 2;
  while (idx < trimmed.length && trimmed[idx] === " ") idx++;

  const rangeEnd = findClosingParenthesis(trimmed, idx - 1);
  if (rangeEnd === -1) return undefined;

  const rangeStr = trimmed.slice(idx, rangeEnd);

  const bodyResult = parseLoopBody(trimmed, rangeEnd + 1);
  if (!bodyResult) return undefined;

  const loopBody = bodyResult.body;
  const forExprEnd = bodyResult.nextIdx;

  // Parse variable declaration - should be "let mut i" or similar
  // Extract variable name from the declaration
  const declTokens: string[] = [];
  let currentToken = "";
  for (const ch of varDeclStr) {
    if (ch === " " || ch === ":" || ch === "\t") {
      if (currentToken) {
        declTokens.push(currentToken);
        currentToken = "";
      }
    } else {
      currentToken += ch;
    }
  }
  if (currentToken) {
    declTokens.push(currentToken);
  }

  let loopVarName: string | undefined;

  if (declTokens[0] === "let") {
    // Format: "let [mut] name" or "let [mut] name : type"
    if (declTokens[1] === "mut") {
      loopVarName = declTokens[2];
    } else {
      loopVarName = declTokens[1];
    }
  }

  if (!loopVarName) return undefined;

  // Parse the range
  const range = parseRange(rangeStr);
  if (!range) return undefined;

  // Create a new scope for the loop variable
  const loopScope = new Map(scope);
  const loopTypeMap = new Map(typeMap);
  const loopMutMap = new Map(mutMap);
  const loopUninitializedSet = new Set(uninitializedSet);
  const loopUnmutUninitializedSet = new Set(unmutUninitializedSet);

  // Declare the loop variable
  loopScope.set(loopVarName, range.start);
  loopMutMap.set(loopVarName, true); // Loop variable is always mutable

  // Execute for loop
  try {
    for (let i = range.start; i < range.end; i++) {
      loopScope.set(loopVarName, i);

      try {
        interpreter(
          loopBody,
          loopScope,
          loopTypeMap,
          loopMutMap,
          loopUninitializedSet,
          loopUnmutUninitializedSet,
        );
      } catch (e) {
        if (e instanceof BreakException) {
          throw e; // Re-throw to be caught by outer handler
        }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof BreakException) {
      const afterForExpr = trimmed.slice(forExprEnd).trim();

      if (afterForExpr) {
        return interpreter(
          afterForExpr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        );
      }
      return e.value;
    }
    throw e;
  }

  // Update the outer scope with any mutations made to shared variables
  for (const [key, value] of loopScope.entries()) {
    if (scope.has(key)) {
      scope.set(key, value);
    }
  }

  // Calculate what comes after the for loop
  const afterForExpr = trimmed.slice(forExprEnd).trim();

  if (afterForExpr) {
    return interpreter(
      afterForExpr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }

  return 0;
}
