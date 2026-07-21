import type { Position, Token } from "./errors";

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

function readStringLiteral(
  source: string,
  start: number,
  line: number,
  col: number,
): { text: string; len: number } {
  const i = start + 1; // skip opening "
  if (i >= source.length) {
    throw new ParseError("unterminated string literal", { line, col });
  }
  let end = i;
  while (end < source.length) {
    const ch = source[end]!;
    if (ch === "\\") {
      end++; // skip escape char
      if (end >= source.length) {
        throw new ParseError("unterminated string literal", { line, col });
      }
      end++; // skip escaped char
    } else if (ch === '"') {
      break;
    } else {
      end++;
    }
  }
  if (end >= source.length) {
    throw new ParseError("unterminated string literal", { line, col });
  }
  const inner = source.slice(start + 1, end);
  const len = end - start + 1; // include closing "
  return { text: '"' + inner + '"', len };
}

function isOperator(ch: string): boolean {
  return "+-*/()=;{}<>=!:,&.[\\]".includes(ch);
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

  while (i < source.length) {
    const ch = source[i]!;
    if (isWhitespace(ch)) {
      advance(ch);
      i++;
    } else if (isDigit(ch)) {
      i = processNumber(source, i, tokens, pos, advance);
    } else if (isIdentStart(ch)) {
      i = processIdent(source, i, tokens, pos, advance);
    } else if (tryMultiCharOp(source, i, tokens, pos)) {
      i = processMultiChar(source, tokens, i, advance);
    } else if (ch === '"') {
      i = processString(source, i, line, col, tokens, pos, advance);
    } else {
      processOther(ch, tokens, pos, advance);
      i++;
    }
  }
  return tokens;
}

function processNumber(
  source: string,
  i: number,
  tokens: Token[],
  pos: () => Position,
  advance: (ch: string) => void,
): number {
  const tokenPos = pos();
  const numEnd = skipDigits(source, i);
  const annEnd = skipTypeAnnotation(source, numEnd);
  tokens.push({ text: source.slice(i, annEnd), pos: tokenPos });
  for (let j = i; j < annEnd; j++) advance(source[j]!);
  return annEnd;
}

function processIdent(
  source: string,
  i: number,
  tokens: Token[],
  pos: () => Position,
  advance: (ch: string) => void,
): number {
  const tokenPos = pos();
  const ident = readIdentifier(source, i);
  tokens.push({ text: ident, pos: tokenPos });
  for (let j = 0; j < ident.length; j++) advance(ident[j]!);
  return i + ident.length;
}

function processMultiChar(
  source: string,
  tokens: Token[],
  i: number,
  advance: (ch: string) => void,
): number {
  const len = getMultiCharLen(tokens[tokens.length - 1]!.text);
  for (let j = 0; j < len; j++) advance(source[i + j]!);
  return i + len;
}

function processString(
  source: string,
  i: number,
  line: number,
  col: number,
  tokens: Token[],
  pos: () => Position,
  advance: (ch: string) => void,
): number {
  const tokenPos = pos();
  const result = readStringLiteral(source, i, line, col);
  tokens.push({ text: result.text, pos: tokenPos });
  for (let j = 0; j < result.text.length; j++) {
    advance(result.text[j]!);
  }
  return i + result.len;
}

function processOther(
  ch: string,
  tokens: Token[],
  pos: () => Position,
  advance: (ch: string) => void,
): void {
  if (isOperator(ch)) {
    const tokenPos = pos();
    tokens.push({ text: ch, pos: tokenPos });
  }
  advance(ch);
}
