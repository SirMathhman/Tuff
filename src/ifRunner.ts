import type { Result } from "./result";
import { findTopLevelChar } from "./interpretHelpers";

interface EvaluateBlockFn<T> {
  (
    inner: string,
    parentEnv?: Map<string, T>,
    localEnv?: Map<string, T>
  ): Result<number, string>;
}
interface ProcessStatementFn<T> {
  (
    stmt: string,
    envLocal: Map<string, T>,
    parentEnvLocal?: Map<string, T>,
    isLast?: boolean
  ): Result<number, string> | "handled" | "break" | "continue" | undefined;
}

export interface ValueLike {
  value: number;
}

export function execBranchAsStatementGeneric<T extends ValueLike>(
  text: string,
  envLocal: Map<string, T>,
  parentEnvLocal: Map<string, T> | undefined,
  isLast: boolean,
  evaluateBlockFn: EvaluateBlockFn<T>,
  processStatementFn: ProcessStatementFn<T>
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "handled";

  if (trimmed.startsWith("{")) {
    const braceEnd = findTopLevelChar(trimmed, 0, "}");
    if (braceEnd === -1)
      return { ok: false, error: "unmatched brace in if body" };
    const inner = trimmed.slice(1, braceEnd);
    const r = evaluateBlockFn(inner, undefined, envLocal);
    if (!r.ok) {
      if (r.error === "break") return "break";
      if (r.error === "continue") return "continue";
      return r as Result<number, string>;
    }
    // If this branch is the final statement of an enclosing block, return its value as the expression result
    if (isLast) return r as Result<number, string>;
    return "handled";
  }

  // single-statement branch
  const endPos = findTopLevelChar(trimmed, 0, ";");
  const stmt = endPos === -1 ? trimmed : trimmed.slice(0, endPos).trim();
  const psRes = processStatementFn(stmt, envLocal, parentEnvLocal, isLast);
  if (psRes === "handled") return "handled";
  if (psRes === "break") return "break";
  if (psRes === "continue") return "continue";
  if (psRes) return psRes;
  return "handled";
}

export function evaluateConditionGeneric<T extends ValueLike>(
  condText: string,
  envLocal: Map<string, T>,
  parentEnvLocal: Map<string, T> | undefined,
  interpretFn: (
    s: string,
    parentEnv?: Map<string, T>
  ) => Result<number, string>,
  substituteAllIdentsFn: (
    src: string,
    envLocal: Map<string, T>,
    parentEnvLocal?: Map<string, T>
  ) => Result<string, string>,
  lookupBindingFn: (
    name: string,
    env: Map<string, T>,
    fallbackEnv?: Map<string, T>
  ) => Result<T, string>,
  isIdentifierOnlyFn: (s: string) => boolean
): Result<boolean, string> {
  const sub = substituteAllIdentsFn(condText, envLocal, parentEnvLocal);
  if (!sub.ok) return { ok: false, error: sub.error };
  const s = sub.value.trim();

  if (isIdentifierOnlyFn(s) && s !== "true" && s !== "false") {
    const name = s.split(" ")[0];
    const b = lookupBindingFn(name, envLocal, parentEnvLocal);
    if (!b.ok) return { ok: false, error: b.error };
    return { ok: true, value: b.value.value === 1 };
  }

  const r = interpretFn(s, envLocal);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, value: r.value !== 0 };
}

export interface InterpretFn<T> {
  (s: string, parentEnv?: Map<string, T>): Result<number, string>;
}

export interface SubstituteAllIdentsFn<T> {
  (
    s: string,
    envLocal: Map<string, T>,
    parentEnvLocal?: Map<string, T>
  ): Result<string, string>;
}

export interface FindMatchingParenIndexFn {
  (s: string, start: number): number;
}

export interface FindTopLevelElseFn {
  (s: string, start: number): number;
}

export function handleStatementElseIfChainGeneric<T extends ValueLike>(
  tStmt: string,
  envLocal: Map<string, T>,
  parentEnvLocal: Map<string, T> | undefined,
  isLast: boolean,
  interpretFn: InterpretFn<T>,
  substituteAllIdentsFn: SubstituteAllIdentsFn<T>,
  findMatchingParenIndexFn: FindMatchingParenIndexFn,
  findTopLevelElseInStringFn: FindTopLevelElseFn,
  evaluateBlockFn: EvaluateBlockFn<T>,
  processStatementFn: ProcessStatementFn<T>
): Result<number, string> | "handled" | "break" | "continue" | undefined {
  let cur = tStmt.trim();

  for (;;) {
    const i = cur.indexOf("(");
    if (i === -1) return undefined;
    const j = findMatchingParenIndexFn(cur, i);
    if (j === -1) return undefined;

    // condition text
    const condText = cur.slice(i + 1, j).trim();
    const condSub = substituteAllIdentsFn(condText, envLocal, parentEnvLocal);
    if (!condSub.ok) return condSub as Result<number, string>;
    const condRes = interpretFn(condSub.value, envLocal);
    if (!condRes.ok) return condRes as Result<number, string>;

    const nextElsePos = findTopLevelElseInStringFn(cur, j + 1);
    if (condRes.value !== 0) {
      // condition true -> execute then-branch (the text between paren end and else)
      const thenText = cur.slice(j + 1, nextElsePos).trim();
      return execBranchAsStatementGeneric(
        thenText,
        envLocal,
        parentEnvLocal,
        isLast,
        evaluateBlockFn,
        processStatementFn
      );
    }

    // condition false -> move to the else-part
    cur = cur.slice(nextElsePos + 4).trim(); // skip 'else'
    if (cur.startsWith("if ") || cur.startsWith("if(")) {
      // continue the loop to parse 'else if'
      continue;
    }

    // final else: execute it as statement
    return execBranchAsStatementGeneric(
      cur,
      envLocal,
      parentEnvLocal,
      isLast,
      evaluateBlockFn,
      processStatementFn
    );
  }
}
