import { checkRange, type RuntimeValue, type PlainObject } from "./types";

export type OperandObject = PlainObject;

export interface StructField {
  name: string;
  value: string;
}

export interface DelimiterConfig {
  src: string;
  startPos: number;
  openChar: string;
  closeChar: string;
}

export interface ParseContext {
  src: string;
  pos: number;
  i: number;
  prefixes: string[];
}

export function splitTopLevelStatements(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]")
      depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

/**
 * Find matching closing parenthesis starting from an opening paren position
 * Returns the index of the closing paren, or -1 if unbalanced
 */
export function findMatchingClosingParen(
  src: string,
  startPos: number
): number {
  return findMatchingDelimiter({
    src,
    startPos,
    openChar: "(",
    closeChar: ")",
  });
}

/**
 * Find matching closing delimiter (supports parens, braces, brackets)
 * Returns the index of the closing delimiter, or -1 if unbalanced
 */
export function findMatchingDelimiter(config: DelimiterConfig): number {
  const { src, startPos, openChar, closeChar } = config;
  let depth = 0;
  for (let k = startPos; k < src.length; k++) {
    const ch = src[k];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return k;
      }
    }
  }
  return -1;
}

/**
 * Parse comma-separated arguments from a string, respecting nested parens and braces
 * Returns array of trimmed argument strings
 */
export function parseCommaSeparatedArgs(inner: string): string[] {
  const args: string[] = [];
  if (inner.trim() === "") return args;

  let cur = "";
  let d = 0;
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k];
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d = Math.max(0, d - 1);
    if (ch === "," && d === 0) {
      args.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") args.push(cur.trim());
  return args;
}

function unescapeString(inner: string) {
  return inner.replace(/\\([\\"'nrtb])/g, (m, ch) => {
    if (ch === "n") return "\n";
    if (ch === "r") return "\r";
    if (ch === "t") return "\t";
    if (ch === "b") return "\b";
    return ch;
  });
}

export function parseOperand(token: string) {
  const s = token.trim();
  // string literal (single or double quoted) - simple unescape for common escapes
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    const inner = s.slice(1, -1);
    const unescaped = unescapeString(inner);
    return unescaped;
  }

  // boolean literals
  if (/^true$/i.test(s)) return { type: "bool-operand", boolValue: true };
  if (/^false$/i.test(s)) return { type: "bool-operand", boolValue: false };

  // Match integer or float with optional suffix attached (e.g., 123, 1.23, 100U8)
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)([uUiI]\d+)?$/);
  if (!m) return undefined;
  const numStr = m[1];
  const suffix = m[2];

  if (suffix) {
    const sufMatch = suffix.match(/^([uUiI])(\d+)$/)!;
    const kind = sufMatch[1];
    const bits = Number(sufMatch[2]);
    // Suffix requires integer (no decimal part)
    if (!/^[-+]?\d+$/.test(numStr))
      throw new Error("suffix requires integer value");
    const valueBig = BigInt(numStr);
    if (kind === "u" || kind === "U") {
      if (valueBig < 0n)
        throw new Error("negative numbers with suffixes are not allowed");
      checkRange("u", bits, valueBig);
      return { type: "int-operand", valueBig, kind: "u", bits };
    }
    // signed
    checkRange("i", bits, valueBig);
    return { type: "int-operand", valueBig, kind: "i", bits };
  }

  // no suffix: accept float or integer
  if (numStr.includes(".")) {
    return { type: "float-operand", floatValue: Number(numStr), isFloat: true };
  }
  return { type: "int-operand", valueBig: BigInt(numStr) };
}

interface StringState {
  string: string;
}

interface CommentStripState {
  input: string;
  out: string;
  i: number;
  L: number;
  state: "normal" | "line" | "block" | StringState;
}

function stepStripNormal(s: CommentStripState) {
  if (s.input.startsWith("//", s.i)) {
    s.state = "line";
    s.i += 2;
    return;
  }
  if (s.input.startsWith("/*", s.i)) {
    s.state = "block";
    s.i += 2;
    return;
  }
  const ch = s.input[s.i];
  if (ch === '"' || ch === "'") {
    s.state = { string: ch };
    s.out += ch;
    s.i++;
    return;
  }
  s.out += ch;
  s.i++;
}

function stepStripLine(s: CommentStripState) {
  const ch = s.input[s.i];
  if (ch === "\n") {
    s.out += ch;
    s.state = "normal";
  }
  s.i++;
}

function stepStripBlock(s: CommentStripState) {
  if (s.input.startsWith("/*", s.i)) throw new Error("nested block comment");
  if (s.input.startsWith("*/", s.i)) {
    s.i += 2;
    s.state = "normal";
    return;
  }
  s.i++;
}

function stepStripString(s: CommentStripState) {
  const ch = s.input[s.i];
  if (ch === "\\") {
    s.out += s.input.substr(s.i, 2);
    s.i += 2;
    return;
  }
  s.out += ch;
  if (
    typeof s.state === "object" &&
    "string" in s.state &&
    ch === s.state.string
  ) {
    s.state = "normal";
  }
  s.i++;
}

function skipWs(src: string, i: number) {
  let j = i;
  while (j < src.length && /[\s]/.test(src[j])) j++;
  return j;
}

function applyPrefixesToOperand(operand: RuntimeValue, prefixes: string[]) {
  let op: RuntimeValue = operand;
  for (let p = prefixes.length - 1; p >= 0; p--) {
    const pr = prefixes[p];
    if (pr === "&") op = { addrOf: op };
    else op = { deref: op };
  }
  return op;
}

function isOperandObject(op: RuntimeValue): op is OperandObject {
  return typeof op === "object" && op != undefined;
}

function finalizeOperand(base: RuntimeValue, prefixes: string[]) {
  const maybeOperand = applyPrefixesToOperand(base, prefixes);
  if (isOperandObject(maybeOperand)) return maybeOperand;
  return { value: maybeOperand };
}

function parsePrefixesAt(src: string, pos: number) {
  let i = skipWs(src, pos);
  const prefixes: string[] = [];
  while (i < src.length && (src[i] === "&" || src[i] === "*")) {
    prefixes.push(src[i]);
    i++;
    i = skipWs(src, i);
  }
  return { i, prefixes };
}

function parseGroupedExprAt(ctx: ParseContext) {
  const { src, pos, i, prefixes } = ctx;
  if (src[i] !== "(") return undefined;
  const endIdx = findMatchingDelimiter({
    src,
    startPos: i,
    openChar: "(",
    closeChar: ")",
  });
  if (endIdx === -1) throw new Error("unbalanced parentheses");
  const inner = src.slice(i + 1, endIdx);
  const operand = applyPrefixesToOperand({ groupedExpr: inner }, prefixes);
  return { operand, len: i - pos + (endIdx - i + 1) };
}

function parseStringLiteralAt(ctx: ParseContext) {
  const { src, pos, i, prefixes } = ctx;
  if (src[i] !== '"' && src[i] !== "'") return undefined;
  const quote = src[i];
  let j = i + 1;
  let closed = false;
  while (j < src.length) {
    if (src[j] === "\\") {
      j += 2;
      continue;
    }
    if (src[j] === quote) {
      closed = true;
      break;
    }
    j++;
  }
  if (!closed) throw new Error("unclosed string literal");
  const inner = src.slice(i + 1, j);
  const unescaped = unescapeString(inner);
  const operand = applyPrefixesToOperand(unescaped, prefixes);
  return { operand, len: i - pos + (j - i + 1) };
}

function parseArrayLiteralAt(ctx: ParseContext) {
  const { src, pos, i, prefixes } = ctx;
  if (src[i] !== "[") return undefined;
  const endIdx = findMatchingDelimiter({
    src,
    startPos: i,
    openChar: "[",
    closeChar: "]",
  });
  if (endIdx === -1) throw new Error("unbalanced brackets in array literal");
  const inner = src.slice(i + 1, endIdx).trim();
  const parts = parseCommaSeparatedArgs(inner);
  const operand = applyPrefixesToOperand({ arrayLiteral: parts }, prefixes);
  return { operand, len: i - pos + (endIdx - i + 1) };
}

function parseCallAt(src: string, j: number) {
  const endIdx = findMatchingClosingParen(src, j);
  if (endIdx === -1) throw new Error("unbalanced parentheses in call");
  const inner = src.slice(j + 1, endIdx);
  const args = parseCommaSeparatedArgs(inner);
  return { args, endIdx };
}

function parseStructFields(inner: string) {
  const fieldParts = parseCommaSeparatedArgs(inner);
  const fields: Array<StructField> = [];
  for (const fieldPart of fieldParts) {
    const fm = fieldPart.match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
    if (!fm) {
      fields.push({ name: `_${fields.length}`, value: fieldPart });
    } else {
      fields.push({ name: fm[1], value: fm[2].trim() });
    }
  }
  return fields;
}

function parseLiteralAt(ctx: ParseContext) {
  const { src, pos, i, prefixes } = ctx;
  const m = src
    .slice(i)
    .match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?|true|false)/i);
  if (!m) return undefined;
  const innerOperand = parseOperand(m[1]);
  if (!innerOperand) throw new Error("invalid operand");
  const operand = finalizeOperand(innerOperand, prefixes);
  return { operand, len: i - pos + m[1].length };
}

function parseIdentifierAt(ctx: ParseContext) {
  const { src, pos, i, prefixes } = ctx;
  const id = src.slice(i).match(/^([a-zA-Z_]\w*)/);
  if (!id) return undefined;

  const base: OperandObject = { ident: id[1] };
  let j = skipWs(src, i + id[1].length);

  if (src[j] === "(") {
    const { args, endIdx } = parseCallAt(src, j);
    base.callArgs = args;
    return {
      operand: finalizeOperand(base, prefixes),
      len: i - pos + id[1].length + (endIdx - j + 1),
    };
  }

  if (src[j] === "{") {
    const endIdx = findMatchingDelimiter({
      src,
      startPos: j,
      openChar: "{",
      closeChar: "}",
    });
    if (endIdx === -1)
      throw new Error("unbalanced braces in struct instantiation");
    const inner = src.slice(j + 1, endIdx).trim();
    const fields = parseStructFields(inner);
    base.structInstantiation = { name: id[1], fields };
    return {
      operand: finalizeOperand(base, prefixes),
      len: i - pos + (endIdx - i + 1),
    };
  }

  return {
    operand: finalizeOperand(base, prefixes),
    len: i - pos + id[1].length,
  };
}

export function stripAndValidateComments(input: string) {
  const s: CommentStripState = {
    input,
    out: "",
    i: 0,
    L: input.length,
    state: "normal",
  };

  while (s.i < s.L) {
    if (s.state === "normal") {
      stepStripNormal(s);
      continue;
    }
    if (s.state === "line") {
      stepStripLine(s);
      continue;
    }
    if (s.state === "block") {
      stepStripBlock(s);
      continue;
    }
    stepStripString(s);
  }
  if (s.state === "block") throw new Error("unterminated block comment");
  if (typeof s.state === "object" && "string" in s.state)
    throw new Error("unterminated string");
  return s.out;
}

export function parseOperandAt(src: string, pos: number) {
  const { i, prefixes } = parsePrefixesAt(src, pos);
  const ctx: ParseContext = { src, pos, i, prefixes };

  const grouped = parseGroupedExprAt(ctx);
  if (grouped) return grouped;

  const strLit = parseStringLiteralAt(ctx);
  if (strLit) return strLit;

  const arrLit = parseArrayLiteralAt(ctx);
  if (arrLit) return arrLit;

  const lit = parseLiteralAt(ctx);
  if (lit) return lit;

  const idRes = parseIdentifierAt(ctx);
  if (idRes) return idRes;
  return undefined;
}
