import { isBreakException } from "./loop";
import { findClosingParenthesis, parseLoopBody } from "./helpers";
import type { HandlerParams } from "./types";

export function handleWhile(params: HandlerParams): number | undefined {
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
  if (!trimmed.startsWith("while")) return undefined;

  let idx = 5; // Position after "while"

  // Skip whitespace after "while"
  while (idx < trimmed.length && trimmed[idx] === " ") idx++;

  if (idx >= trimmed.length || trimmed[idx] !== "(") return undefined;

  const condEnd = findClosingParenthesis(trimmed, idx);
  if (condEnd === -1) return undefined;

  const conditionStr = trimmed.slice(idx + 1, condEnd);
  idx = condEnd + 1;

  const bodyResult = parseLoopBody(trimmed, idx);
  if (!bodyResult) return undefined;

  const loopBody = bodyResult.body;
  const whileExprEnd = bodyResult.nextIdx;

  // Execute while loop: keep executing body while condition is true
  try {
    for (;;) {
      const condition = interpreter(
        conditionStr,
        scope,
        typeMap,
        mutMap,
        uninitializedSet,
        unmutUninitializedSet,
      );

      if (condition === 0) break; // Exit loop if condition is false

      try {
        interpreter(
          loopBody,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        );
      } catch (e) {
        if (isBreakException(e)) {
          throw e; // Re-throw to be caught by outer handler
        }
        throw e;
      }
    }
  } catch (e) {
    if (isBreakException(e)) {
      const afterWhileExpr = trimmed.slice(whileExprEnd).trim();

      if (afterWhileExpr) {
        return interpreter(
          afterWhileExpr,
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

  // Calculate what comes after the while loop
  const afterWhileExpr = trimmed.slice(whileExprEnd).trim();

  if (afterWhileExpr) {
    return interpreter(
      afterWhileExpr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }

  return 0;
}
