import type { Interpreter } from "./expressions/handlers";
import { BreakException } from "./loop";

interface HandlerParams {
  s: string;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
  uninitializedSet?: Set<string>;
  unmutUninitializedSet?: Set<string>;
}

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
  idx++; // Skip opening paren

  // Find the matching closing parenthesis for the condition
  let parenDepth = 1;
  const condStart = idx;

  while (idx < trimmed.length && parenDepth > 0) {
    if (trimmed[idx] === "(") parenDepth++;
    else if (trimmed[idx] === ")") parenDepth--;
    if (parenDepth > 0) idx++;
  }

  if (parenDepth !== 0) return undefined;

  const conditionStr = trimmed.slice(condStart, idx);
  idx++; // Skip closing paren

  // Skip whitespace
  while (idx < trimmed.length && trimmed[idx] === " ") idx++;

  let loopBody: string;
  const bodyStart = idx;

  if (idx < trimmed.length && trimmed[idx] === "{") {
    // Braced body
    idx++; // Skip opening brace
    let braceDepth = 1;

    while (idx < trimmed.length && braceDepth > 0) {
      if (trimmed[idx] === "{") braceDepth++;
      else if (trimmed[idx] === "}") braceDepth--;
      if (braceDepth > 0) idx++;
    }

    if (braceDepth !== 0) return undefined;

    loopBody = trimmed.slice(bodyStart + 1, idx).trim();
    idx++; // Skip closing brace
  } else {
    // Non-braced body - find the semicolon
    const semiIdx = trimmed.indexOf(";", idx);
    if (semiIdx === -1) return undefined;
    loopBody = trimmed.slice(idx, semiIdx + 1);
    idx = semiIdx + 1;
  }

  const whileExprEnd = idx;

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
        if (e instanceof BreakException) {
          throw e; // Re-throw to be caught by outer handler
        }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof BreakException) {
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
