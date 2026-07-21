import type { Position, Token } from "./errors";
import { ParseError } from "./errors";

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

function isDigit(ch: string): boolean {
  return /\d/.test(ch);
}

function isIdentStart(ch: string): boolean {
  return /[a-zA-Z_]/.test(ch);
}

function tryMultiCharOp(
  source: string,
  posIdx: number,
  tokens: Token[],
  currentPos: () => Position,
): boolean {
  const ch = source[posIdx]!;
  const next = source[posIdx + 1];
  if (isFatArrow(ch, next)) {
    tokens.push({ text: "=>", pos: currentPos() });
    return true;
  }
  if (isLogicalOp(ch, next)) {
    tokens.push({ text: ch + next, pos: currentPos() });
    return true;
  }
  if (isAssignCompound(ch, next)) {
    tokens.push({ text: ch + next, pos: currentPos() });
    return true;
  }
  if (isCompareCompound(ch, next)) {
    tokens.push({ text: ch + next, pos: currentPos() });
    return true;
  }
  return false;
}

function isFatArrow(ch: string, next: string | undefined): boolean {
  return ch === "=" && next === ">";
}

function isLogicalOp(ch: string, next: string | undefined): boolean {
  return (ch === "|" && next === "|") || (ch === "&" && next === "&");
}

function isAssignCompound(ch: string, next: string | undefined): boolean {
  return ch === "+" && next === "=";
}

function isCompareCompound(ch: string, next: string | undefined): boolean {
  return (
    (ch === "<" && next === "=") ||
    (ch === ">" && next === "=") ||
    (ch === "!" && next === "=") ||
    (ch === "=" && next === "=")
  );
}

function getMultiCharLen(token: string): number {
  return token.length;
}

function skipDigits(source: string, start: number): number {
  let i = start;
  while (i < source.length && /\d/.test(source[i]!)) i++;
  return i;
}

function readIdentifier(source: string, start: number): string {
  let ident = "";
  for (
    let i = start;
    i < source.length && /[a-zA-Z0-9_]/.test(source[i]!);
    i++
  ) {
    ident += source[i]!;
  }
  return ident;
}

function skipTypeAnnotation(source: string, start: number): number {
  let i = start;
  if (i < source.length && (source[i] === "U" || source[i] === "I")) {
    i++;
    while (i < source.length && /\d/.test(source[i]!)) i++;
  }
  return i;
}

function readCharLiteral(
  source: string,
  start: number,
  line: number,
  col: number,
): { ok: true; text: string; len: number } | { ok: false } {
  const i = start + 1; // skip opening '
  if (i >= source.length) {
    throw new ParseError("unterminated char literal", { line, col });
  }

  const ch = source[i]!;
  if (ch === "'") {
    throw new ParseError("empty char literal", { line, col });
  }

  let end: number;
  if (ch === "\\") {
    const escape = parseEscape(source, i + 1);
    if (escape === null) return { ok: false };
    end = i + 1 + escape.len;
  } else {
    end = i + ch.length;
  }

  // Check for closing quote
  if (end >= source.length || source[end]! !== "'") return { ok: false };
  end++; // skip closing '

  const text = source.slice(start, end);
  return { ok: true, text, len: end - start };
}

function parseEscape(
  source: string,
  start: number,
): { codePoint: number; len: number } | null {
  const ch = source[start]!;
  if (ch === "n") return { codePoint: 10, len: 1 };
  if (ch === "t") return { codePoint: 9, len: 1 };
  if (ch === "r") return { codePoint: 13, len: 1 };
  if (ch === "\\") return { codePoint: 92, len: 1 };
  if (ch === "'") return { codePoint: 39, len: 1 };
  if (ch === "0") return { codePoint: 0, len: 1 };
  return parseUnicodeEscape(source, start);
}

function parseUnicodeEscape(
  source: string,
  start: number,
): { codePoint: number; len: number } | null {
  const ch = source[start]!;
  if (ch !== "u" || source[start + 1] !== "{") return null;
  let end = start + 2;
  while (end < source.length && source[end]! !== "}") end++;
  if (end >= source.length) return null;
  const hex = source.slice(start + 2, end);
  const codePoint = parseInt(hex, 16);
  if (isNaN(codePoint)) return null;
  return { codePoint, len: end - start + 1 };
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  function pos(): Position {
    return { line, col };
  }

  function advance(ch: string): void {
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }

  function advanceText(text: string): void {
    for (let j = 0; j < text.length; j++) {
      advance(text[j]!);
    }
  }

  function processCharLiteral(
    src: string, si: number, sl: number, sc: number, p: () => Position,
  ): { token: { text: string; pos: Position }; text: string; len: number } | null {
    const tokenPos = p();
    const result = readCharLiteral(src, si, sl, sc);
    if (result.ok) {
      return { token: { text: result.text, pos: tokenPos }, text: result.text, len: result.len };
    }
    return null;
  }

  function processNumber(
    src: string, si: number, p: () => Position,
  ): { token: { text: string; pos: Position }; text: string; len: number } {
    const tokenPos = p();
    const numEnd = skipDigits(src, si);
    const annEnd = skipTypeAnnotation(src, numEnd);
    const text = src.slice(si, annEnd);
    return { token: { text, pos: tokenPos }, text, len: annEnd - si };
  }

  function processIdent(
    src: string, si: number, p: () => Position,
  ): { token: { text: string; pos: Position }; text: string; len: number } {
    const tokenPos = p();
    const ident = readIdentifier(src, si);
    return { token: { text: ident, pos: tokenPos }, text: ident, len: ident.length };
  }

  function processToken(
    src: string, si: number, sl: number, sc: number, toks: Token[], p: () => Position,
  ): { token?: { text: string; pos: Position }; text?: string; len: number } | null {
    const ch = src[si]!;
    if (isWhitespace(ch)) return { len: 1 };
    if (isDigit(ch)) return processNumber(src, si, p);
    if (isIdentStart(ch)) return processIdent(src, si, p);
    if (tryMultiCharOp(src, si, toks, p)) {
      const len = getMultiCharLen(toks[toks.length - 1]!.text);
      return { len };
    }
    if (ch === "'") {
      const result = processCharLiteral(src, si, sl, sc, p);
      if (result) return result;
    }
    return null;
  }

  while (i < source.length) {
    const result = processToken(source, i, line, col, tokens, pos);
    if (result) {
      if (result.token) tokens.push(result.token);
      if (result.text) advanceText(result.text);
      else advance(source[i]!);
      i += result.len;
    } else {
      advance(source[i]!);
      i++;
    }
  }
  return tokens;
}
