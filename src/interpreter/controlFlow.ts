import type { Env, EnvItem } from "./types";
import { interpret } from "./interpret";
import { makeDeletedEnvItem } from "./env";
import { evalBlock, isYieldValue, isBreakException, isContinueException } from "./statements";
import {
  ensure,
  ensureNonEmptyPair,
  ensureStartsWith,
  extractParenContent,
  findTopLevel,
  parseMutPrefix,
  parseIdentifierAt,
  sliceAfterKeyword,
  sliceTrim,
  startsWithFor,
  startsWithIf,
  startsWithWhile,
} from "./shared";

interface IfResult {
  consumed: number;
  last: number;
}

interface AttachResult {
  part: string;
  consumed: number;
}

function attachNextIfEmptyAt(
  part: string,
  idx: number,
  stmts: string[],
  forbidElse: boolean
): AttachResult {
  let consumed = 0;
  if (part === "" && idx + 1 < stmts.length) {
    const next = stmts[idx + 1].trim();
    if (!(forbidElse && next.startsWith("else"))) {
      consumed = 1;
      part = stmts[idx + 1];
    }
  }
  return { part, consumed } as AttachResult;
}

function handleIfAt(idx: number, stmts: string[], env: Env): IfResult {
  const stmt = stmts[idx];
  const { content: condStr, close } = extractParenContent(stmt, "if");
  let thenPart = stmt.slice(close + 1).trim();

  let consumed = 0;
  // if thenPart is empty, maybe the next top-level stmt is the then-part
  ({ part: thenPart, consumed } = attachNextIfEmptyAt(
    thenPart,
    idx,
    stmts,
    true
  ));

  // check for else in the following stmt (either same stmt or next)
  let elsePart: string | undefined;
  if (thenPart.startsWith("else")) {
    // no then part was present, else is attached directly
    elsePart = sliceAfterKeyword(thenPart, 4);
    thenPart = "";
  } else if (
    idx + 1 + consumed < stmts.length &&
    stmts[idx + 1 + consumed].trim().startsWith("else")
  ) {
    consumed += 1;
    elsePart = sliceAfterKeyword(stmts[idx + consumed].trim(), 4);
  }

  const condVal = interpret(condStr, env);
  let lastLocal = NaN;
  const part = condVal !== 0 ? thenPart : elsePart;
  if (part !== undefined && part !== "") lastLocal = evalBlock(part, env);
  return { consumed, last: lastLocal } as IfResult;
}

interface ControlFlowResult {
  handled: boolean;
  last: number;
  consumed: number;
}

function findTopLevelRangeIndex(rest: string): number {
  const res = findTopLevel(rest, (s, i) =>
    s[i] === "." && s[i + 1] === "." ? i : undefined
  );
  return res === undefined ? -1 : (res as number);
}

interface ForHeader {
  name: string;
  mutable: boolean;
  left: string;
  right: string;
}

function parseForHeader(h: string): ForHeader {
  let s = h.trim();
  ensureStartsWith(s, "let ", "Invalid for header");
  s = sliceAfterKeyword(s, 4);
  const mutRes = parseMutPrefix(s);
  const mutable = mutRes.mutable;
  s = mutRes.rest;
  const idRes = parseIdentifierAt(s, 0);
  if (!idRes) throw new Error("Invalid for header");
  const name = idRes.name;
  let rest = sliceTrim(s, idRes.next);
  ensureStartsWith(rest, "in", "Invalid for header");
  rest = sliceTrim(rest, 2);
  const dotIdx = findTopLevelRangeIndex(rest);
  ensure(dotIdx !== -1, "Invalid for range");
  const left = rest.slice(0, dotIdx).trim();
  const right = rest.slice(dotIdx + 2).trim();
  ensureNonEmptyPair(left, right, "Invalid for range");
  return { name, mutable, left, right } as ForHeader;
}

function resolveBodyAfterClose(
  stmt: string,
  close: number,
  idx: number,
  stmts: string[],
  forbidElse: boolean
) {
  let body = stmt.slice(close + 1).trim();
  let consumed = 0;
  ({ part: body, consumed } = attachNextIfEmptyAt(
    body,
    idx,
    stmts,
    forbidElse
  ));
  return { body, consumed };
}

function executeLoopBodyWithContinue(body: string, env: Env): number {
  let lastLocal = NaN;
  try {
    lastLocal = evalBlock(body, env);
  } catch (e: unknown) {
    if (isContinueException(e)) {
      // continue skips to next iteration, return last value before continue
      return lastLocal;
    }
    throw e;
  }
  return lastLocal;
}

function handleWhileAt(
  idx: number,
  stmts: string[],
  env: Env
): ControlFlowResult {
  const { content: condStr, close } = extractParenContent(stmts[idx], "while");
  const stmt = stmts[idx];
  const { body, consumed } = resolveBodyAfterClose(
    stmt,
    close,
    idx,
    stmts,
    false
  );

  let lastLocal = NaN;
  try {
    while (interpret(condStr, env) !== 0) {
      lastLocal = executeLoopBodyWithContinue(body, env);
    }
  } catch (e: unknown) {
    if (isBreakException(e)) {
      return { handled: true, last: lastLocal, consumed } as ControlFlowResult;
    }
    if (isYieldValue(e)) {
      throw e; // propagate yield out of while
    }
    throw e;
  }
  return { handled: true, last: lastLocal, consumed } as ControlFlowResult;
}

function handleForAt(
  idx: number,
  stmts: string[],
  env: Env
): ControlFlowResult {
  const { content: header, close } = extractParenContent(stmts[idx], "for");
  const { body, consumed } = resolveBodyAfterClose(
    stmts[idx],
    close,
    idx,
    stmts,
    false
  );

  const { name, mutable, left, right } = parseForHeader(header);
  const startVal = interpret(left, env);
  const endVal = interpret(right, env);
  let lastLocal = NaN;

  // preserve any outer binding of the same name; ensure loop variable does not leak
  const outerHas = env.has(name);
  const outerItem = outerHas ? env.get(name) : undefined;

  try {
    for (let i = startVal; i < endVal; i++) {
      // create shallow env and declare loop variable
      const loopEnv = new Map<string, EnvItem>(env);
      loopEnv.set(name, { value: i, mutable, type: undefined } as EnvItem);
      lastLocal = executeLoopBodyWithContinue(body, loopEnv);
    }
  } catch (e: unknown) {
    if (isBreakException(e)) {
      // break caught, exit the loop
    } else if (isYieldValue(e)) {
      throw e; // propagate yield out of for
    } else {
      throw e;
    }
  }

  // ensure loop-declared name is not visible after the loop
  if (!outerHas) {
    // ensure not present and mark as deleted so identifier lookup throws
    while (env.has(name)) env.delete(name);
    env.set(name, makeDeletedEnvItem());
  } else {
    // restore outer binding if it existed
    env.set(name, outerItem!);
  }

  return { handled: true, last: lastLocal, consumed } as ControlFlowResult;
}

export function tryHandleControlFlow(
  idx: number,
  stmts: string[],
  env: Env
): ControlFlowResult {
  const stmt = stmts[idx];
  if (startsWithIf(stmt)) {
    try {
      const res = handleIfAt(idx, stmts, env);
      return { handled: true, last: res.last, consumed: res.consumed };
    } catch (e: unknown) {
      if (isYieldValue(e)) {
        throw e; // propagate yield out of if
      }
      if (isBreakException(e)) {
        throw e; // propagate break out of if
      }
      if (isContinueException(e)) {
        throw e; // propagate continue out of if
      }
      throw e;
    }
  }

  const flowHandlers: Array<
    [
      (s: string) => boolean,
      (i: number, st: string[], e: Env) => ControlFlowResult
    ]
  > = [
    [startsWithWhile, handleWhileAt],
    [startsWithFor, handleForAt],
  ];
  for (const [check, fn] of flowHandlers) {
    if (check(stmt)) return fn(idx, stmts, env);
  }

  return { handled: false, last: NaN, consumed: 0 } as ControlFlowResult;
}
