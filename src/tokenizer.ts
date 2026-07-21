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
  if (i < source.length && source[i] === "U") {
    i++;
    while (i < source.length && /\d/.test(source[i]!)) i++;
  }
  return i;
}

function isOperator(ch: string): boolean {
  return "+-*/()=;{}<>=!:,&.".includes(ch);
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
      const tokenPos = pos();
      const numEnd = skipDigits(source, i);
      const annEnd = skipTypeAnnotation(source, numEnd);
      tokens.push({ text: source.slice(i, annEnd), pos: tokenPos });
      for (let j = i; j < annEnd; j++) advance(source[j]!);
      i = annEnd;
    } else if (isIdentStart(ch)) {
      const tokenPos = pos();
      const ident = readIdentifier(source, i);
      tokens.push({ text: ident, pos: tokenPos });
      for (let j = 0; j < ident.length; j++) advance(ident[j]!);
      i += ident.length;
    } else if (tryMultiCharOp(source, i, tokens, pos)) {
      const len = getMultiCharLen(tokens[tokens.length - 1]!.text);
      for (let j = 0; j < len; j++) advance(source[i + j]!);
      i += len;
    } else if (isOperator(ch)) {
      const tokenPos = pos();
      tokens.push({ text: ch, pos: tokenPos });
      advance(ch);
      i++;
    } else {
      advance(ch);
      i++;
    }
  }
  return tokens;
}
