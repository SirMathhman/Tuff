import type { Token, Result, CompileError, Err } from "./types";

interface TokenizeContext {
  source: string;
  pos: number;
  line: number;
  column: number;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentChar(ch: string): boolean {
  return isDigit(ch) || isAlpha(ch);
}

const OPERATOR_CHARS = new Set([
  "=",
  ";",
  ":",
  "{",
  "}",
  ",",
  ".",
  "<",
  ">",
  "&",
  "|",
  "!",
]);

function isOperator(ch: string): boolean {
  return OPERATOR_CHARS.has(ch);
}

const OP_TYPE_MAP: Record<string, string> = {
  "=": "EQUALS",
  ";": "SEMICOLON",
  ":": "COLON",
  "{": "LBRACE",
  "}": "RBRACE",
  ",": "COMMA",
  ".": "DOT",
  "<": "LBRACKET",
  ">": "RBRACKET",
  "!": "NOT",
  "|": "PIPE",
};

function tokenizeOperator(ch: string, ctx: TokenizeContext): Token {
  const type_ = OP_TYPE_MAP[ch] || "UNKNOWN";
  return { type: type_, value: ch, line: ctx.line, column: ctx.column };
}

const MULTI_CHAR_OPS = new Set(["&", "|"]);
function tryReadMultiCharOp(
  ch: string,
  ctx: TokenizeContext,
): Result<Token, null> {
  if (!MULTI_CHAR_OPS.has(ch)) return { isOk: false, error: null as never };
  const next = ctx.source[ctx.pos + 1];
  if (next === ch) {
    return {
      isOk: true,
      value: {
        type: ch === "&" ? "AND" : "OR",
        value: ch + next,
        line: ctx.line,
        column: ctx.column,
      },
    };
  }
  // Single | is PIPE (for type disjunctions)
  if (ch === "|") return { isOk: true, value: tokenizeOperator(ch, ctx) };
  return { isOk: false, error: null as never };
}

function readNumber(ctx: TokenizeContext): Token {
  let numStr = "";
  while (ctx.pos < ctx.source.length) {
    const c = ctx.source[ctx.pos];
    if (!c || !isDigit(c)) break;
    numStr += c;
    ctx.pos++;
    ctx.column++;
  }
  let typeSuffix = "";
  const suffixCh = ctx.source[ctx.pos];
  if (suffixCh && isAlpha(suffixCh)) {
    while (ctx.pos < ctx.source.length) {
      const sc = ctx.source[ctx.pos];
      if (!sc || !isIdentChar(sc)) break;
      typeSuffix += sc;
      ctx.pos++;
      ctx.column++;
    }
  }
  return {
    type: "NUMBER",
    value: numStr,
    typeSuffix,
    line: ctx.line,
    column: ctx.column,
  };
}

function readIdentifier(ctx: TokenizeContext): Token {
  let ident = "";
  while (ctx.pos < ctx.source.length) {
    const c = ctx.source[ctx.pos];
    if (!c || !isIdentChar(c)) break;
    ident += c;
    ctx.pos++;
    ctx.column++;
  }
  if (ident === "true" || ident === "false")
    return {
      type: "BOOLEAN",
      value: ident,
      line: ctx.line,
      column: ctx.column,
    };
  if (ident === "is")
    return {
      type: "IS",
      value: ident,
      line: ctx.line,
      column: ctx.column,
    };
  return {
    type: "IDENTIFIER",
    value: ident,
    line: ctx.line,
    column: ctx.column,
  };
}

function tokenizeUnknown(ch: string, ctx: TokenizeContext): Err<CompileError> {
  return {
    isOk: false,
    error: {
      message: "Unexpected character: '" + ch + "'",
      reason: "Only digits, identifiers, and operators are supported.",
      suggestedFix: "Remove unsupported characters.",
      line: ctx.line,
      column: ctx.column,
    },
  };
}

function skipWhitespace(ctx: TokenizeContext): boolean {
  const ch = ctx.source[ctx.pos];
  if (ch === " " || ch === "\t" || ch === "\r") {
    ctx.pos++;
    ctx.column++;
    return true;
  }
  if (ch === "\n") {
    ctx.pos++;
    ctx.line++;
    ctx.column = 1;
    return true;
  }
  return false;
}

export function tokenize(source: string): Result<Token[], CompileError> {
  const tokens: Token[] = [];
  const ctx: TokenizeContext = { source, pos: 0, line: 1, column: 1 };
  while (ctx.pos < ctx.source.length) {
    const ch = ctx.source[ctx.pos];
    if (!ch) break;
    if (skipWhitespace(ctx)) continue;
    if (isDigit(ch)) {
      const token = readNumber(ctx);
      token.column = ctx.column;
      token.line = ctx.line;
      tokens.push(token);
      continue;
    }
    if (MULTI_CHAR_OPS.has(ch)) {
      const multiResult = tryReadMultiCharOp(ch, ctx);
      if (multiResult.isOk) {
        tokens.push(multiResult.value);
        ctx.pos += 2;
        ctx.column += 2;
        continue;
      }
      return tokenizeUnknown(ch, ctx);
    }
    if (isOperator(ch)) {
      tokens.push(tokenizeOperator(ch, ctx));
      ctx.pos++;
      ctx.column++;
      continue;
    }
    if (isAlpha(ch)) {
      const token = readIdentifier(ctx);
      token.column = ctx.column;
      token.line = ctx.line;
      tokens.push(token);
      continue;
    }
    return tokenizeUnknown(ch, ctx);
  }
  return { isOk: true, value: tokens };
}
