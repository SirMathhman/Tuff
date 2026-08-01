import type { Token } from "./ast";
import { OPERATORS } from "./ast";
import type { Result } from "./result";
import { ok, err } from "./result";
import type { CompileError } from "./compileError";
import { compileError } from "./compileError";
import { SUFFIXES } from "./types";

// Lookup from operator symbol -> token type, longest symbols first so that
// multi-character operators (e.g. "||") are matched before single-character ones.
const SYMBOL_TO_TYPE = [...OPERATORS.entries()]
  .sort((a, b) => b[1].symbol.length - a[1].symbol.length)
  .map(([type, info]) => [info.symbol, type] as const);

// Keyword name -> token type. `true`/`false` are handled separately in
// scanIdentifier because they carry a boolean value.
const KEYWORDS = new Map<string, Token["type"]>([
  ["let", "let"],
  ["mut", "mut"],
  ["if", "if"],
  ["else", "else"],
  ["while", "while"],
  ["is", "is"],
  ["fn", "fn"],
  ["struct", "struct"],
]);

// Single-character token lookup, so each punctuation token is a table entry
// rather than its own branch.
const SINGLE_CHAR_TO_TYPE = new Map<string, Token["type"]>([
  ["&", "amp"],
  ["(", "lparen"],
  [")", "rparen"],
  ["{", "lbrace"],
  ["}", "rbrace"],
  ["[", "lbracket"],
  ["]", "rbracket"],
  [".", "dot"],
  [":", "colon"],
  [",", "comma"],
  ["=", "equals"],
  [";", "semicolon"],
]);

// Shared mutable state threaded through the scanner helpers. Each helper
// advances `i` and/or pushes to `tokens`, returning whether it consumed input.
interface Scanner {
  source: string;
  i: number;
  tokens: Token[];
}

function createScanner(source: string): Scanner {
  return { source, i: 0, tokens: [] };
}

function skipWhitespace(s: Scanner): boolean {
  const start = s.i;
  while (
    s.i < s.source.length &&
    (s.source[s.i] === " " ||
      s.source[s.i] === "\t" ||
      s.source[s.i] === "\n" ||
      s.source[s.i] === "\r")
  ) {
    s.i++;
  }
  return s.i > start;
}

// Line comment: "//" consumes everything up to (but not including) the next
// newline. The newline itself is skipped by skipWhitespace.
function skipLineComment(s: Scanner): boolean {
  if (!s.source.startsWith("//", s.i)) return false;
  while (s.i < s.source.length && s.source[s.i] !== "\n") {
    s.i++;
  }
  return true;
}

// Block comment: "/*" consumes everything up to the matching "*/".
// An unterminated block comment is a syntax error.
function skipBlockComment(s: Scanner): Result<boolean, CompileError> {
  if (!s.source.startsWith("/*", s.i)) return ok(false);
  const end = s.source.indexOf("*/", s.i + 2);
  if (end === -1) {
    return err(compileError("syntax", "Unterminated block comment"));
  }
  s.i = end + 2;
  return ok(true);
}

// Number literal: digits + optional "." + optional type suffix.
function scanNumber(s: Scanner): boolean {
  const charCode = s.source.charCodeAt(s.i);
  if (charCode === undefined || charCode < 48 || charCode > 57) return false;
  let num = "";
  while (s.i < s.source.length) {
    const c = s.source.charCodeAt(s.i);
    if (c === undefined) break;
    if ((c >= 48 && c <= 57) || c === 46) {
      num += s.source[s.i];
      s.i++;
    } else {
      break;
    }
  }
  // Optional type suffix (e.g. "U8" in "100U8", "U16" in "100U16").
  // SUFFIXES is ordered longest-first so multi-char suffixes match first.
  let suffix: string | undefined;
  for (const suf of SUFFIXES) {
    if (s.source.startsWith(suf, s.i)) {
      suffix = suf;
      s.i += suf.length;
      break;
    }
  }
  s.tokens.push({ type: "number", value: Number(num), suffix });
  return true;
}

// Identifier or keyword.
function scanIdentifier(s: Scanner): boolean {
  const ch = s.source[s.i]!;
  if (!(
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_" ||
    ch === "$"
  )) {
    return false;
  }
  let name = "";
  while (s.i < s.source.length) {
    const c = s.source[s.i]!;
    if (
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "_" ||
      c === "$"
    ) {
      name += c;
      s.i++;
    } else {
      break;
    }
  }
  if (name === "true") {
    s.tokens.push({ type: "boolean", value: true });
  } else if (name === "false") {
    s.tokens.push({ type: "boolean", value: false });
  } else {
    const keyword = KEYWORDS.get(name);
    if (keyword !== undefined) {
      s.tokens.push({ type: keyword } as Token);
    } else {
      s.tokens.push({ type: "identifier", name });
    }
  }
  return true;
}

// Operators: compound assignment, fat arrow, the OPERATORS table, then
// single-character punctuation.
function scanOperator(s: Scanner): boolean {
  if (s.source.startsWith("+=", s.i)) {
    s.tokens.push({ type: "plus_equals" });
    s.i += 2;
    return true;
  }
  if (s.source.startsWith("=>", s.i)) {
    s.tokens.push({ type: "fat_arrow" });
    s.i += 2;
    return true;
  }
  for (const [symbol, type] of SYMBOL_TO_TYPE) {
    if (s.source.startsWith(symbol, s.i)) {
      s.tokens.push({ type } as Token);
      s.i += symbol.length;
      return true;
    }
  }
  const char = s.source[s.i]!;
  const single = SINGLE_CHAR_TO_TYPE.get(char);
  if (single !== undefined) {
    s.tokens.push({ type: single } as Token);
    s.i++;
    return true;
  }
  return false;
}

export function tokenize(source: string): Result<Token[], CompileError> {
  const s = createScanner(source);

  while (s.i < source.length) {
    if (skipWhitespace(s)) continue;
    if (skipLineComment(s)) continue;
    const block = skipBlockComment(s);
    if (!block.ok) return block;
    if (block.value) continue;
    if (scanNumber(s)) continue;
    if (scanIdentifier(s)) continue;
    if (scanOperator(s)) continue;

    // Unknown character: fail loudly instead of silently skipping
    return err(
      compileError("syntax", "Unexpected character: '" + source[s.i] + "'"),
    );
  }

  s.tokens.push({ type: "eof" });
  return ok(s.tokens);
}
