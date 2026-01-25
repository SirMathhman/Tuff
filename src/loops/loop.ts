type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
) => number;

interface HandlerParams {
  s: string;
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  interpreter: Interpreter;
  uninitializedSet?: Set<string>;
  unmutUninitializedSet?: Set<string>;
}

function createBreakException(value: number): Error & { value: number } {
  const error = new Error("break") as Error & { value: number };
  error.value = value;
  return error;
}

function isBreakException(err: unknown): err is Error & { value: number } {
  return (
    err instanceof Error &&
    err.message === "break" &&
    typeof (err as Error & { value?: unknown }).value === "number"
  );
}

export { isBreakException };

function findLoopBodyBracesEnd(afterLoop: string): number {
  let braceDepth = 0;
  for (let i = 0; i < afterLoop.length; i++) {
    const ch = afterLoop[i];
    if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function executeInfiniteLoop(
  loopBody: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): void {
  for (;;) {
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
        throw e;
      }
      throw e;
    }
  }
}

export function handleLoop(params: HandlerParams): number | undefined {
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
  if (!trimmed.startsWith("loop")) return undefined;
  const afterLoop = trimmed.slice(4).trimStart();
  if (!afterLoop.startsWith("{")) return undefined;
  const braceCloseIdx = findLoopBodyBracesEnd(afterLoop);
  if (braceCloseIdx === -1) return undefined;
  const loopBody = afterLoop.slice(1, braceCloseIdx).trim();
  try {
    executeInfiniteLoop(
      loopBody,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
      interpreter,
    );
  } catch (e) {
    if (isBreakException(e)) {
      const loopExprEnd = trimmed.indexOf("{") + 1 + braceCloseIdx + 1;
      const afterLoopExpr = trimmed.slice(loopExprEnd).trim();
      if (afterLoopExpr) {
        return interpreter(
          afterLoopExpr,
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
}

export function handleBreak(params: HandlerParams): void {
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
  if (!trimmed.startsWith("break")) return;

  const afterBreak = trimmed.slice(5).trim();

  if (afterBreak === "" || afterBreak === ";") {
    // break; or break (no value)
    throw createBreakException(0);
  }

  // Parse the value to break with
  let valueStr = afterBreak;
  if (afterBreak.includes(";")) {
    valueStr = afterBreak.slice(0, afterBreak.indexOf(";")).trim();
  }

  const value = interpreter(
    valueStr,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  throw createBreakException(value);
}
