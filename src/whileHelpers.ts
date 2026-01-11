import type { Result } from "./result";

interface BindingValue {
  value: number;
}

function evaluateConditionLoop(
  condText: string,
  evalCond: (condText: string) => Result<boolean, string>,
  bodyRunner: () => Result<void, string> | "continue" | "break" | undefined
): Result<void, string> {
  for (;;) {
    const c = evalCond(condText);
    if (!c.ok) return c as Result<void, string>;
    if (!c.value) break;
    const br = bodyRunner();
    if (br === "continue") continue;
    if (br === "break") break;
    if (br !== undefined) return br as Result<void, string>;
  }
  return { ok: true, value: undefined };
}

export function runBracedWhile<T>(
  inner: string,
  condText: string,
  envLocal: Map<string, T>,
  evalCond: (condText: string) => Result<boolean, string>,
  evaluateBlock: (
    inner: string,
    parentEnv?: Map<string, T>,
    localEnv?: Map<string, T>
  ) => Result<number, string>
): Result<void, string> {
  return evaluateConditionLoop(condText, evalCond, () => {
    const innerRes = evaluateBlock(inner, undefined, envLocal);
    if (!innerRes.ok) {
      if (innerRes.error === "block has no final expression") return "continue";
      if (innerRes.error === "break") return "break";
      return innerRes as Result<void, string>;
    }
    return undefined;
  });
}

export function runSingleStmtWhile<T>(
  stmtBody: string,
  condText: string,
  envLocal: Map<string, T>,
  evalCond: (condText: string) => Result<boolean, string>,
  processStatement: (
    stmt: string,
    envLocal: Map<string, T>,
    parentEnvLocal?: Map<string, T>,
    isLast?: boolean
  ) => Result<number, string> | "handled" | "break" | undefined,
  parentEnvLocal?: Map<string, T>
): Result<void, string> {
  return evaluateConditionLoop(condText, evalCond, () => {
    const res = processStatement(stmtBody, envLocal, parentEnvLocal, false);
    if (res === "handled") return "continue";
    if (res === "break") return "break";
    if (res) return res as Result<void, string>;
    return undefined;
  });
}

export interface WhileHandlers<T> {
  interpretFn: (
    s: string,
    parentEnv?: Map<string, T>
  ) => Result<number, string>;
  substituteAllIdentsFn: (
    src: string,
    envLocal: Map<string, T>,
    parentEnvLocal?: Map<string, T>
  ) => Result<string, string>;
  lookupBindingFn: (
    name: string,
    env: Map<string, T>,
    fallbackEnv?: Map<string, T>
  ) => Result<T, string>;
  isIdentifierOnlyFn: (s: string) => boolean;
  processStatementFn: (
    stmt: string,
    envLocal: Map<string, T>,
    parentEnvLocal?: Map<string, T>,
    isLast?: boolean
  ) => Result<number, string> | "handled" | "break" | undefined;
  evaluateBlockFn: (
    inner: string,
    parentEnv?: Map<string, T>,
    localEnv?: Map<string, T>
  ) => Result<number, string>;
  findMatchingParenIndexFn: (s: string, start: number) => number;
}

interface WhileParts {
  condText: string;
  body: string;
}

function evaluateCond<T extends BindingValue>(
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

export function handleTopLevelWhileStmt<T extends BindingValue>(
  tStmt: string,
  envLocal: Map<string, T>,
  parentEnvLocal: Map<string, T> | undefined,
  handlers: WhileHandlers<T>
): Result<number, string> | "handled" | undefined {
  const parts = parseWhileParts(tStmt, handlers.findMatchingParenIndexFn);
  if (!parts) return undefined;
  const { condText, body } = parts;

  const evalCondText = (ct: string): Result<boolean, string> => {
    return evaluateCond(
      ct,
      envLocal,
      parentEnvLocal,
      handlers.interpretFn,
      handlers.substituteAllIdentsFn,
      handlers.lookupBindingFn,
      handlers.isIdentifierOnlyFn
    );
  };

  if (body.startsWith("{")) {
    const idx = findMatchingBraceIndex(body);
    if (idx === -1)
      return { ok: false, error: "unmatched brace in while body" };
    const inner = body.slice(1, idx);
    const r = runBracedWhile(
      inner,
      condText,
      envLocal,
      (ct) => evalCondText(ct),
      handlers.evaluateBlockFn
    );
    if (!r.ok) return r as Result<number, string>;
    return "handled";
  }

  const stmtBody = body;
  const r = runSingleStmtWhile(
    stmtBody,
    condText,
    envLocal,
    (ct) => evalCondText(ct),
    handlers.processStatementFn,
    parentEnvLocal
  );
  if (!r.ok) return r as Result<number, string>;
  return "handled";
}

function findMatchingBraceIndex(body: string): number {
  let depth = 0;
  for (let p = 0; p < body.length; p++) {
    if (body[p] === "{") depth++;
    else if (body[p] === "}") {
      depth--;
      if (depth === 0) return p;
    }
  }
  return -1;
}

function parseWhileParts(
  tStmt: string,
  findMatchingParenIndexFn: (s: string, start: number) => number
): WhileParts | undefined {
  if (!tStmt.startsWith("while ") && !tStmt.startsWith("while("))
    return undefined;
  const i = tStmt.indexOf("(");
  if (i === -1) return undefined;
  const k = findMatchingParenIndexFn(tStmt, i);
  if (k === -1) return undefined;
  const condText = tStmt.slice(i + 1, k).trim();
  const body = tStmt.slice(k + 1).trim();
  if (body.length === 0) return undefined;
  return { condText, body };
}
