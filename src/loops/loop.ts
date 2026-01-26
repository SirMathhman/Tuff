import { getLoopCore, type HandlerParams } from "./types";

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
  core: ReturnType<typeof getLoopCore>,
): void {
  for (;;) {
    try {
      core.interpreter(
        loopBody,
        core.scope,
        core.typeMap,
        core.mutMap,
        core.uninitializedSet,
        core.unmutUninitializedSet,
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
  const trimmed = params.s.trim();
  if (!trimmed.startsWith("loop")) return undefined;
  const core = getLoopCore(params);
  const afterLoop = trimmed.slice(4).trimStart();
  if (!afterLoop.startsWith("{")) return undefined;
  const braceCloseIdx = findLoopBodyBracesEnd(afterLoop);
  if (braceCloseIdx === -1) return undefined;
  const loopBody = afterLoop.slice(1, braceCloseIdx).trim();
  try {
    executeInfiniteLoop(loopBody, core);
  } catch (e) {
    if (isBreakException(e)) {
      const loopExprEnd = trimmed.indexOf("{") + 1 + braceCloseIdx + 1;
      const afterLoopExpr = trimmed.slice(loopExprEnd).trim();
      if (afterLoopExpr) {
        return core.interpreter(
          afterLoopExpr,
          core.scope,
          core.typeMap,
          core.mutMap,
          core.uninitializedSet,
          core.unmutUninitializedSet,
        );
      }
      return e.value;
    }
    throw e;
  }
}

export function handleBreak(params: HandlerParams): void {
  const trimmed = params.s.trim();
  if (!trimmed.startsWith("break")) return;

  const core = getLoopCore(params);

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

  const value = core.interpreter(
    valueStr,
    core.scope,
    core.typeMap,
    core.mutMap,
    core.uninitializedSet,
    core.unmutUninitializedSet,
  );
  throw createBreakException(value);
}
