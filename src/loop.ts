type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
) => number;

// Special error used to break out of a loop with a value
class BreakException extends Error {
  constructor(public value: number) {
    super("break");
  }
}

export function handleLoop(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): number | undefined {
  const trimmed = s.trim();
  if (!trimmed.startsWith("loop")) return undefined;

  const afterLoop = trimmed.slice(4).trimStart();
  if (!afterLoop.startsWith("{")) return undefined;

  // Find the matching closing brace
  let braceDepth = 0;
  let braceCloseIdx = -1;

  for (let i = 0; i < afterLoop.length; i++) {
    const ch = afterLoop[i];
    if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        braceCloseIdx = i;
        break;
      }
    }
  }

  if (braceCloseIdx === -1) return undefined;

  const loopBody = afterLoop.slice(1, braceCloseIdx).trim();

  try {
    // Infinite loop - keep executing the body
    for (;;) {
      try {
        // Interpret the entire loop body as a single expression
        // This allows complex statements like if-break to work
        interpreter(loopBody, scope, typeMap, mutMap);
      } catch (e) {
        if (e instanceof BreakException) {
          throw e; // Re-throw to be caught by outer handler
        }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof BreakException) {
      // Calculate position after the loop body
      const loopExprEnd = trimmed.indexOf("{") + 1 + braceCloseIdx + 1;
      const afterLoopExpr = trimmed.slice(loopExprEnd).trim();

      if (afterLoopExpr) {
        return interpreter(afterLoopExpr, scope, typeMap, mutMap);
      }
      return e.value;
    }
    throw e;
  }
}

export function handleBreak(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  interpreter: Interpreter,
): void {
  const trimmed = s.trim();
  if (!trimmed.startsWith("break")) return;

  const afterBreak = trimmed.slice(5).trim();

  if (afterBreak === "" || afterBreak === ";") {
    // break; or break (no value)
    throw new BreakException(0);
  }

  // Parse the value to break with
  let valueStr = afterBreak;
  if (afterBreak.includes(";")) {
    valueStr = afterBreak.slice(0, afterBreak.indexOf(";")).trim();
  }

  const value = interpreter(valueStr, scope, typeMap, mutMap);
  throw new BreakException(value);
}

export { BreakException };
