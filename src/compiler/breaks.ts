/* eslint-disable complexity, max-lines-per-function */
import { findMatching } from "./functions";

export interface Range {
  start: number;
  end: number;
}
export interface IfArmRange {
  thenStart: number;
  thenEnd: number;
  elseStart: number;
  elseEnd: number;
}

export function findStandaloneTokens(input: string, tok: string): number[] {
  const res: number[] = [];
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (inSingle || inDouble) continue;
    if (
      input.startsWith(tok, i) &&
      (i === 0 || !/[A-Za-z0-9_$]/.test(input[i - 1])) &&
      (i + tok.length >= input.length ||
        !/[A-Za-z0-9_$]/.test(input[i + tok.length]))
    ) {
      res.push(i);
    }
  }
  return res;
}

function getSingleStmtEnd(input: string, start: number): number {
  let depth = 0;
  let i = start;
  for (; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" || ch === '"') break; // pragmatic
    // If we encounter a top-level '{', treat it as the end of a single-statement
    // body (e.g., `while (cond) { ... }`), so break here before we increment
    // depth for the '{'.
    if (ch === "{" && depth === 0) break;
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === ";" && depth === 0) break;
  }
  return i;
}

export function getWhileRanges(input: string): Range[] {
  const ranges: Range[] = [];
  const whileRe = /\bwhile\b/g;
  let m: RegExpExecArray | undefined;
  while ((m = whileRe.exec(input) as RegExpExecArray | undefined)) {
    const idx = m.index;
    const k = findMatchingParenAfter(input, idx + m[0].length);
    if (k === undefined) continue;
    let p = k + 1;
    while (p < input.length && /\s/.test(input[p])) p++;
    if (input[p] === "{") {
      const bc = findMatching(input, p + 1, "{", "}");
      if (bc === undefined) continue;
      ranges.push({ start: p, end: bc });
    } else {
      const end = getSingleStmtEnd(input, p);
      ranges.push({ start: p, end });
    }
  }
  return ranges;
}

export function posInRanges(pos: number, ranges: Range[]): boolean {
  return ranges.some((r) => pos >= r.start && pos <= r.end);
}

function wordBeforeParen(input: string, parenOpenIdx: number): string {
  let k = parenOpenIdx - 1;
  while (k >= 0 && /\s/.test(input[k])) k--;
  const wend = k;
  let wstart = k;
  while (wstart >= 0 && /[A-Za-z0-9_$]/.test(input[wstart])) wstart--;
  wstart++;
  return input.slice(wstart, wend + 1);
}

export function getWordBeforeIndex(input: string, idx: number): string {
  // Reuse `wordBeforeParen` logic by passing an index that points to the
  // character immediately before an imagined '('. This avoids duplicating the
  // same scanning logic in multiple places.
  return wordBeforeParen(input, idx + 1);
}

export function findMatchingParenAfter(input: string, start: number): number | undefined {
  let j = start;
  while (j < input.length && /\s/.test(input[j])) j++;
  if (input[j] !== "(") return undefined;
  return findMatching(input, j + 1, "(", ")");
}

const EXPR_PREV_CHARS = new Set([
  "=",
  "(",
  ")",
  ":",
  ",",
  "?",
  "!",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "&",
  "|",
  "~",
  "[",
  "{",
  "",
]);
export function isExprPrevChar(ch: string): boolean {
  return EXPR_PREV_CHARS.has(ch);
}

export function getWordBeforeParenIfAny(
  input: string,
  prev: number
): string | undefined {
  if (prev < 0) return undefined;
  let j = prev - 1;
  let depth = 1;
  for (; j >= 0 && depth > 0; j--) {
    const ch = input[j];
    if (ch === ")") depth++;
    else if (ch === "(") depth--;
  }
  if (depth === 0) {
    const parenOpenIdx = j + 1;
    return wordBeforeParen(input, parenOpenIdx);
  }
  return undefined;
}

export function findElseStartAfter(input: string, thenEnd: number): number | undefined {
  const foundElse = input.indexOf("else", thenEnd + 1);
  if (foundElse === -1) return undefined;
  let r = foundElse + 4;
  while (r < input.length && /\s/.test(input[r])) r++;
  return r;
}

export function blockWouldBeTransformed(
  input: string,
  openIdx: number
): boolean {
  let prev = openIdx - 1;
  while (prev >= 0 && /\s/.test(input[prev])) prev--;
  const prevCh = prev >= 0 ? input[prev] : "";

  if (/[A-Za-z0-9_$]/.test(prevCh)) {
    const wend = prev;
    let wstart = prev;
    while (wstart >= 0 && /[A-Za-z0-9_$]/.test(input[wstart])) wstart--;
    wstart++;
    const word = input.slice(wstart, wend + 1);
    if (word !== "else") return false;
  }
  if (prevCh === "]") return false;
  if (!EXPR_PREV_CHARS.has(prevCh)) return false;

  if (prevCh === ")") {
    const word = getWordBeforeParenIfAny(input, prev);
    if (word === "if") {
      let pre = input.indexOf(word) - 1;
      while (pre >= 0 && /\s/.test(input[pre])) pre--;
      const preCh = pre >= 0 ? input[pre] : "";
      if (!isExprPrevChar(preCh)) return false;
    }
    if (word === "while" || word === "for" || word === "switch") return false;
  }

  return true;
}

export function isExprIfAt(input: string, i: number): boolean {
  // Determine expression context similar to parseIfAt
  let ctx = i - 1;
  while (ctx >= 0 && /\s/.test(input[ctx])) ctx--;
  const ctxPrev = ctx >= 0 ? input[ctx] : "";
  let isExprContext = EXPR_PREV_CHARS.has(ctxPrev);
  if (isExprContext && ctxPrev === ")") {
    const wordBefore = getWordBeforeParenIfAny(input, ctx);
    if (wordBefore === "while" || wordBefore === "for" || wordBefore === "switch") {
      isExprContext = false;
    } else if (wordBefore === "if") {
      let pre = ctx - 1;
      while (pre >= 0 && /\s/.test(input[pre])) pre--;
      const preCh = pre >= 0 ? input[pre] : "";
      if (!EXPR_PREV_CHARS.has(preCh)) isExprContext = false;
    }
  }
  if (!isExprContext) {
    const wend = ctx;
    let wstart = ctx;
    while (wstart >= 0 && /[A-Za-z0-9_$]/.test(input[wstart])) wstart--;
    wstart++;
    const word = input.slice(wstart, wend + 1);
    if (word === "return") isExprContext = true;
  }
  return isExprContext;
}

export function getExprIfRanges(input: string): IfArmRange[] {
  const res: IfArmRange[] = [];

  for (let i = 0; i < input.length; i++) {
    if (input.startsWith("if", i) && (i === 0 || /\W/.test(input[i - 1]))) {
      if (!isExprIfAt(input, i)) continue;
      const k = findMatchingParenAfter(input, i + 2);
      if (k === undefined) continue;
      let q = k + 1;
      while (q < input.length && /\s/.test(input[q])) q++;
      const thenStart = q;
      if (input[q] === "{") {
        const thenClose = findMatching(input, q + 1, "{", "}");
        if (thenClose === undefined) continue;
        const thenEnd = thenClose;
        const r = findElseStartAfter(input, thenEnd);
        if (r === undefined) continue;
        const elseStart = r;
        const elseEnd: number = ((): number => {
          if (input[r] === "{") {
            const elseClose = findMatching(input, r + 1, "{", "}");
            if (elseClose === undefined) return r;
            return elseClose;
          }
          let s = r;
          for (; s < input.length; s++) {
            const ch = input[s];
            if (ch === ";" || ch === "\n" || ch === "\r") break;
          }
          return s - 1;
        })();
        res.push({ thenStart, thenEnd, elseStart, elseEnd });
      } else {
        let s = q;
        for (; s < input.length; s++) {
          const ch = input[s];
          if (ch === ";" || ch === "\n" || ch === "\r") break;
        }
        const thenEnd = s - 1;
        const r = findElseStartAfter(input, thenEnd);
        if (r === undefined) continue;
        const elseStart = r;
        let elseEnd = r;
        for (; elseEnd < input.length; elseEnd++) {
          const ch = input[elseEnd];
          if (ch === ";" || ch === "\n" || ch === "\r") break;
        }
        res.push({ thenStart, thenEnd, elseStart, elseEnd });
      }
    }
  }
  return res;
}

export function validateBreakContinueUsage(input: string): string | undefined {
  const breaks = findStandaloneTokens(input, "break");
  const continues = findStandaloneTokens(input, "continue");
  const whileRanges = getWhileRanges(input);
  const exprIfRanges = getExprIfRanges(input);

  function makeErr(msg: string): string {
    return `(function(){ throw new Error("${msg}"); })()`;
  }

  for (const bpos of breaks) {
    if (posInRanges(bpos, whileRanges)) continue;
    let inExprIfArm = false;
    for (const r of exprIfRanges) {
      if (bpos >= r.thenStart && bpos <= r.thenEnd) inExprIfArm = true;
      if (bpos >= r.elseStart && bpos <= r.elseEnd) inExprIfArm = true;
    }
    if (inExprIfArm) return makeErr("break not allowed in expression context");

    let openIdx = -1;
    for (let i = bpos; i >= 0; i--) {
      if (input[i] === "{") {
        const close = findMatching(input, i + 1, "{", "}");
        if (close !== undefined && close >= bpos) {
          openIdx = i;
          break;
        }
      }
    }
    if (openIdx !== -1 && blockWouldBeTransformed(input, openIdx)) {
      if (!posInRanges(bpos, whileRanges))
        return makeErr("break not allowed in expression block");
    }

    return makeErr("break outside loop");
  }

  for (const cpos of continues) {
    if (posInRanges(cpos, whileRanges)) continue;
    return `(function(){ throw new Error("continue outside loop"); })()`;
  }

  return undefined;
}
