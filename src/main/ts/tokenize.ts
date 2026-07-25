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
  "(",
  ")",
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
  "(": "LPAREN",
  ")": "RPAREN",
  "!": "NOT",
  "|": "PIPE",
  "&": "AMPERSAND",
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
    ctx.pos += 2;
    ctx.column += 2;
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
  ctx.pos++;
  ctx.column++;
  if (ch === "|") return { isOk: true, value: tokenizeOperator(ch, ctx) };
  if (ch === "&") return { isOk: true, value: tokenizeOperator(ch, ctx) };
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
  if (ident === "enum")
    return {
      type: "ENUM",
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

function resolveEscape(next: string | undefined): string {
  if (next === "n") return "\n";
  if (next === "t") return "\t";
  if (next === '"') return '"';
  if (next === "\\") return "\\";
  if (next === "r") return "\r";
  return next || "";
}

function readString(ctx: TokenizeContext): Result<Token, CompileError> {
  let str = "";
  ctx.pos++;
  ctx.column++;
  while (ctx.pos < ctx.source.length) {
    const c = ctx.source[ctx.pos];
    if (!c) break;
    ctx.pos++;
    ctx.column++;
    if (c === '"') {
      return {
        isOk: true,
        value: {
          type: "STRING_LITERAL",
          value: str,
          line: ctx.line,
          column: ctx.column,
        },
      };
    }
    if (c === "\\") {
      const next = ctx.source[ctx.pos];
      if (next) {
        ctx.pos++;
        ctx.column++;
      }
      str += resolveEscape(next);
      continue;
    }
    str += c;
  }
  return {
    isOk: false,
    error: {
      message: "Unterminated string literal",
      reason: "String literal must end with a double quote.",
      suggestedFix: 'Add a closing " to the string.',
      line: ctx.line,
      column: ctx.column,
    },
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

function skipLineComment(ctx: TokenizeContext): boolean {
  const ch = ctx.source[ctx.pos];
  const next = ctx.source[ctx.pos + 1];
  if (ch === "/" && next === "/") {
    ctx.pos += 2;
    ctx.column += 2;
    while (ctx.pos < ctx.source.length) {
      const c = ctx.source[ctx.pos];
      if (c === "\n") break;
      ctx.pos++;
      ctx.column++;
    }
    return true;
  }
  return false;
}

function skipBlockComment(
  ctx: TokenizeContext,
): Result<void, CompileError> | null {
  const ch = ctx.source[ctx.pos];
  const next = ctx.source[ctx.pos + 1];
  if (ch === "/" && next === "*") {
    ctx.pos += 2;
    ctx.column += 2;
    while (ctx.pos < ctx.source.length) {
      const c = ctx.source[ctx.pos];
      if (!c) {
        return {
          isOk: false,
          error: {
            message: "Unterminated block comment",
            reason: "Block comment must end with */.",
            suggestedFix: "Add */ to close the comment.",
            line: ctx.line,
            column: ctx.column,
          },
        };
      }
      if (c === "\n") {
        ctx.line++;
        ctx.column = 1;
      } else {
        ctx.column++;
      }
      const nextC = ctx.source[ctx.pos + 1];
      if (c === "*" && nextC === "/") {
        ctx.pos += 2;
        ctx.column += 2;
        return { isOk: true, value: undefined };
      }
      ctx.pos++;
    }
    return {
      isOk: false,
      error: {
        message: "Unterminated block comment",
        reason: "Block comment must end with */.",
        suggestedFix: "Add */ to close the comment.",
        line: ctx.line,
        column: ctx.column,
      },
    };
  }
  return null;
}

function tryTokenizeMultiChar(
  ch: string,
  ctx: TokenizeContext,
): Result<Token, CompileError> | null {
  if (!MULTI_CHAR_OPS.has(ch)) return null;
  const multiResult = tryReadMultiCharOp(ch, ctx);
  if (!multiResult.isOk) return tokenizeUnknown(ch, ctx);
  return { isOk: true, value: multiResult.value };
}

function pushToken(token: Token, tokens: Token[], ctx: TokenizeContext): void {
  token.column = ctx.column;
  token.line = ctx.line;
  tokens.push(token);
}

function tryTokenizeLiteral(
  ch: string,
  ctx: TokenizeContext,
): Result<Token | null, CompileError> {
  if (isDigit(ch)) return { isOk: true, value: readNumber(ctx) };
  if (isAlpha(ch)) return { isOk: true, value: readIdentifier(ctx) };
  if (ch === '"') {
    const tokenResult = readString(ctx);
    if (!tokenResult.isOk) return tokenResult;
    return { isOk: true, value: tokenResult.value };
  }
  return { isOk: true, value: null };
}

function tryParseSimpleToken(
  ch: string,
  ctx: TokenizeContext,
): Result<Token | null, CompileError> {
  const multiResult = tryTokenizeMultiChar(ch, ctx);
  if (multiResult) {
    if (!multiResult.isOk) return multiResult;
    return { isOk: true, value: multiResult.value };
  }
  if (isOperator(ch)) {
    const token = tokenizeOperator(ch, ctx);
    ctx.pos++;
    ctx.column++;
    return { isOk: true, value: token };
  }
  const literalResult = tryTokenizeLiteral(ch, ctx);
  if (!literalResult.isOk) return literalResult;
  return { isOk: true, value: literalResult.value };
}

export function tokenize(source: string): Result<Token[], CompileError> {
  const tokens: Token[] = [];
  const ctx: TokenizeContext = { source, pos: 0, line: 1, column: 1 };
  while (ctx.pos < ctx.source.length) {
    const ch = ctx.source[ctx.pos];
    if (!ch) break;
    if (skipWhitespace(ctx)) continue;
    if (skipLineComment(ctx)) continue;
    const blockResult = skipBlockComment(ctx);
    if (blockResult) {
      if (!blockResult.isOk) return blockResult;
      continue;
    }
    const tokenResult = tryParseSimpleToken(ch, ctx);
    if (!tokenResult.isOk) return tokenResult;
    if (tokenResult.value) {
      pushToken(tokenResult.value, tokens, ctx);
      continue;
    }
    return tokenizeUnknown(ch, ctx);
  }
  return { isOk: true, value: tokens };
}
