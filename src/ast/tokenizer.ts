import {
  type Token,
  type LiteralToken,
  type KeywordToken,
  type IdentifierToken,
  KEYWORDS,
} from "./tokens";

interface TokenizerState {
  input: string;
  pos: number;
  tokens: Token[];
}

// Skip whitespace characters
function skipWhitespace(state: TokenizerState): void {
  while (state.pos < state.input.length && /\s/.test(state.input[state.pos])) {
    state.pos++;
  }
}

// Skip single-line comment
function skipLineComment(state: TokenizerState): boolean {
  if (state.input.startsWith("//", state.pos)) {
    while (state.pos < state.input.length && state.input[state.pos] !== "\n") {
      state.pos++;
    }
    return true;
  }
  return false;
}

// Skip multi-line comment
function skipBlockComment(state: TokenizerState): boolean {
  if (state.input.startsWith("/*", state.pos)) {
    state.pos += 2;
    while (
      state.pos < state.input.length &&
      !state.input.startsWith("*/", state.pos)
    ) {
      state.pos++;
    }
    state.pos += 2;
    return true;
  }
  return false;
}

// Parse string literal with escape sequences
function parseStringLiteral(state: TokenizerState): LiteralToken {
  const quote = state.input[state.pos];
  const startPos = state.pos;
  state.pos++;
  let value = "";

  while (state.pos < state.input.length && state.input[state.pos] !== quote) {
    if (state.input[state.pos] === "\\") {
      state.pos++;
      if (state.pos < state.input.length) {
        const escaped = state.input[state.pos];
        value += getEscapeChar(escaped);
        state.pos++;
      }
    } else {
      value += state.input[state.pos];
      state.pos++;
    }
  }
  state.pos++; // closing quote
  return {
    kind: "literal",
    literalKind: "string",
    value,
    position: startPos,
  };
}

// Get character for escape sequence
function getEscapeChar(c: string): string {
  if (c === "n") return "\n";
  if (c === "r") return "\r";
  if (c === "t") return "\t";
  if (c === "b") return "\b";
  return c;
}

// Collect consecutive digits matching a pattern
function collectDigits(state: TokenizerState, pattern: RegExp): string {
  let result = "";
  while (state.pos < state.input.length && pattern.test(state.input[state.pos])) {
    result += state.input[state.pos];
    state.pos++;
  }
  return result;
}

// Parse numeric literal (int or float)
function parseNumericLiteral(state: TokenizerState): LiteralToken {
  const startPos = state.pos;
  let numStr = "";

  // Check for hex
  if (state.input.startsWith("0x", state.pos)) {
    numStr = "0x";
    state.pos += 2;
    numStr += collectDigits(state, /[0-9a-fA-F]/);
    return createIntToken(state, startPos, numStr);
  }

  // Parse integer part
  numStr += collectDigits(state, /[0-9]/);

  // Check for float
  if (
    state.input[state.pos] === "." &&
    /[0-9]/.test(state.input[state.pos + 1] ?? "")
  ) {
    numStr += ".";
    state.pos++;
    numStr += collectDigits(state, /[0-9]/);
    return {
      kind: "literal",
      literalKind: "float",
      value: numStr,
      position: startPos,
    };
  }

  return createIntToken(state, startPos, numStr);
}

// Create int token with optional suffix
function createIntToken(
  state: TokenizerState,
  startPos: number,
  numStr: string
): LiteralToken {
  // Check for type suffix (i8, u8, i16, u16, i32, u32, i64, u64) - case insensitive
  let suffix: string | undefined;
  const suffixMatch = state.input
    .slice(state.pos)
    .match(/^([iIuU])(8|16|32|64)/);
  if (suffixMatch) {
    suffix = suffixMatch[0];
    state.pos += suffix.length;
  }
  return {
    kind: "literal",
    literalKind: "int",
    value: numStr,
    suffix,
    position: startPos,
  };
}

// Parse identifier or keyword
function parseIdentOrKeyword(
  state: TokenizerState
): KeywordToken | IdentifierToken {
  const startPos = state.pos;
  let ident = "";
  while (
    state.pos < state.input.length &&
    /[a-zA-Z0-9_]/.test(state.input[state.pos])
  ) {
    ident += state.input[state.pos];
    state.pos++;
  }

  if (KEYWORDS.has(ident)) {
    return {
      kind: "keyword",
      keyword: ident,
      value: ident,
      position: startPos,
    };
  }
  return { kind: "identifier", value: ident, position: startPos };
}

// Check for multi-character operator
function checkMultiCharOp(state: TokenizerState): string | undefined {
  // Order matters - longer matches first
  const ops = [
    "=>",
    "->",
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "+=",
    "-=",
    "*=",
    "/=",
    "..",
  ];
  for (const op of ops) {
    if (state.input.startsWith(op, state.pos)) {
      return op;
    }
  }
  return undefined;
}

// Parse operator token
function parseOperator(state: TokenizerState): Token {
  const startPos = state.pos;
  const multiOp = checkMultiCharOp(state);
  if (multiOp) {
    state.pos += multiOp.length;
    return { kind: "operator", value: multiOp, position: startPos };
  }
  const ch = state.input[state.pos];
  state.pos++;
  return { kind: "operator", value: ch, position: startPos };
}

// Single character token sets
const DELIMITERS = new Set(["(", ")", "[", "]", "{", "}"]);
const PUNCTUATION = new Set([",", ";", ":", "=", "."]);
const OPERATORS = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "&",
  "|",
  "^",
  "@",
]);

/**
 * Tokenize source code into tokens with position tracking
 */
export function tokenize(input: string): Token[] {
  const state: TokenizerState = { input, pos: 0, tokens: [] };

  while (state.pos < input.length) {
    skipWhitespace(state);
    if (state.pos >= input.length) break;
    if (skipLineComment(state)) continue;
    if (skipBlockComment(state)) continue;

    tokenizeNextToken(state);
  }

  state.tokens.push({ kind: "eof", value: "", position: input.length });
  return state.tokens;
}

function tokenizeNextToken(state: TokenizerState): void {
  const ch = state.input[state.pos];

  // String literals
  if (ch === '"' || ch === "'") {
    state.tokens.push(parseStringLiteral(state));
    return;
  }

  // Numbers
  if (/[0-9]/.test(ch)) {
    state.tokens.push(parseNumericLiteral(state));
    return;
  }

  // Identifiers and keywords
  if (/[a-zA-Z_]/.test(ch)) {
    state.tokens.push(parseIdentOrKeyword(state));
    return;
  }

  // Delimiters
  if (DELIMITERS.has(ch)) {
    state.tokens.push({ kind: "delimiter", value: ch, position: state.pos });
    state.pos++;
    return;
  }

  // Multi-char operators (must check BEFORE punctuation)
  const multiOp = checkMultiCharOp(state);
  if (multiOp) {
    state.tokens.push({
      kind: "operator",
      value: multiOp,
      position: state.pos,
    });
    state.pos += multiOp.length;
    return;
  }

  // Punctuation (single-char only, after multi-char check)
  if (PUNCTUATION.has(ch)) {
    state.tokens.push({
      kind: "punctuation",
      value: ch,
      position: state.pos,
    });
    state.pos++;
    return;
  }

  // Single-char operators
  if (OPERATORS.has(ch)) {
    state.tokens.push(parseOperator(state));
    return;
  }

  // Unknown character - skip
  state.pos++;
}
