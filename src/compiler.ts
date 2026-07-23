// ============================================================
// Tuff MVP Compiler — Lexer → Parser → CodeGen → CLI
// Target: JavaScript (ES2020)
// ============================================================

import * as fs from "fs";

// ---- Token Types ----

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOL"
  | "IDENT"
  | "KEYWORD"
  | "OP"
  | "COLON"
  | "EQ"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "SEMI"
  | "DOT"
  | "ARROW"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ---- Lexer ----

const KEYWORDS = new Set(["let", "fn", "if", "else", "while", "true", "false"]);

function lexerError(msg: string, line: number, col: number): never {
  throw new Error(msg + " at line " + line + ":" + col);
}

function checkLoop(iterations: number, line: number, col: number): number {
  if (iterations > 1024)
    lexerError("Lexer loop exceeded 1024 iterations", line, col);
  return iterations;
}

function skipWhitespace(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; line: number; col: number } {
  let iterations = 0;
  let i = pos;
  let l = line;
  let c = col;
  while (i < source.length && /\s/.test(source[i])) {
    iterations = checkLoop(iterations, l, c);
    if (source[i] === "\n") {
      l++;
      c = 1;
    } else {
      c++;
    }
    i++;
  }
  return { pos: i, line: l, col: c };
}

function skipComment(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; line: number; col: number } {
  const i = pos;
  const l = line;
  const c = col;
  if (source[i] === "/" && source[i + 1] === "/") {
    return skipLineComment(source, i, l, c);
  }
  if (source[i] === "/" && source[i + 1] === "*") {
    return skipBlockComment(source, i, l, c);
  }
  return { pos: i, line: l, col: c };
}

function skipLineComment(
  source: string,
  i: number,
  l: number,
  c: number,
): { pos: number; line: number; col: number } {
  let pos = i;
  let col = c;
  let iterations = 0;
  while (pos < source.length && source[pos] !== "\n") {
    iterations = checkLoop(iterations, l, col);
    pos++;
    col++;
  }
  return { pos, line: l, col };
}

function skipBlockComment(
  source: string,
  i: number,
  l: number,
  c: number,
): { pos: number; line: number; col: number } {
  let pos = i + 2;
  let col = c + 2;
  let line = l;
  let iterations = 0;
  while (pos < source.length - 1) {
    if (source[pos] === "*" && source[pos + 1] === "/") {
      return { pos: pos + 2, line, col: col + 2 };
    }
    iterations = checkLoop(iterations, line, col);
    if (source[pos] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    pos++;
  }
  return { pos, line, col };
}

function lexString(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; col: number; value: string } {
  let i = pos + 1;
  let c = col + 1;
  let str = "";
  let iterations = 0;
  while (i < source.length && source[i] !== '"') {
    iterations = checkLoop(iterations, line, c);
    if (source[i] === "\\") {
      i++;
      c++;
      if (i < source.length) {
        str += source[i];
      }
    } else {
      str += source[i];
    }
    i++;
    c++;
  }
  if (source[i] !== '"') {
    lexerError("Unterminated string", line, c);
  }
  return { pos: i + 1, col: c + 1, value: str };
}

function lexNumber(
  source: string,
  pos: number,
  col: number,
): { pos: number; col: number; value: string } {
  let i = pos;
  let c = col;
  let num = "";
  let iterations = 0;
  while (i < source.length && /[0-9.]/.test(source[i])) {
    iterations = checkLoop(iterations, 1, c);
    num += source[i];
    i++;
    c++;
  }
  return { pos: i, col: c, value: num };
}

function lexIdent(
  source: string,
  pos: number,
  col: number,
): { pos: number; col: number; value: string } {
  let i = pos;
  let c = col;
  let ident = "";
  let iterations = 0;
  while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) {
    iterations = checkLoop(iterations, 1, c);
    ident += source[i];
    i++;
    c++;
  }
  return { pos: i, col: c, value: ident };
}

function makeToken(
  type: TokenType,
  value: string,
  line: number,
  col: number,
): Token {
  return { type, value, line, col };
}

function lexToken(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; col: number; token: Token } {
  const ch = source[pos];

  if (ch === '"') {
    return lexStringToken(source, pos, line, col);
  }

  if (/[0-9]/.test(ch)) {
    return lexNumberToken(source, pos, line, col);
  }

  if (/[a-zA-Z_$]/.test(ch)) {
    return lexIdentToken(source, pos, line, col);
  }

  return lexPunctuatorToken(source, pos, line, col);
}

function lexStringToken(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; col: number; token: Token } {
  const result = lexString(source, pos, line, col);
  return {
    pos: result.pos,
    col: result.col,
    token: makeToken("STRING", result.value, line, col),
  };
}

function lexNumberToken(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; col: number; token: Token } {
  const result = lexNumber(source, pos, col);
  return {
    pos: result.pos,
    col: result.col,
    token: makeToken("NUMBER", result.value, line, col),
  };
}

function lexIdentToken(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; col: number; token: Token } {
  const result = lexIdent(source, pos, col);
  let type: TokenType = "IDENT";
  if (result.value === "true" || result.value === "false") {
    type = "BOOL";
  } else if (KEYWORDS.has(result.value)) {
    type = "KEYWORD";
  }
  return {
    pos: result.pos,
    col: result.col,
    token: makeToken(type, result.value, line, col),
  };
}

function lexPunctuatorToken(
  source: string,
  pos: number,
  line: number,
  col: number,
): { pos: number; col: number; token: Token } {
  const ch = source[pos];

  if (pos + 1 < source.length) {
    const two = source[pos] + source[pos + 1];
    if (["==", "!=", "<=", ">=", "=>"].includes(two)) {
      const type = two === "=>" ? "ARROW" : "OP";
      return {
        pos: pos + 2,
        col: col + 2,
        token: makeToken(type, two, line, col),
      };
    }
  }

  const tokenType = lexSingleCharType(ch);
  if (tokenType) {
    return {
      pos: pos + 1,
      col: col + 1,
      token: makeToken(tokenType, ch, line, col),
    };
  }

  lexerError("Unexpected character '" + ch + "'", line, col);
}

function lexSingleCharType(ch: string): TokenType | null {
  const map: Record<string, TokenType> = {
    "(": "LPAREN",
    ")": "RPAREN",
    "{": "LBRACE",
    "}": "RBRACE",
    "[": "LBRACKET",
    "]": "RBRACKET",
    ",": "COMMA",
    ";": "SEMI",
    ".": "DOT",
    ":": "COLON",
    "=": "EQ",
    "+": "OP",
    "-": "OP",
    "*": "OP",
    "/": "OP",
    "%": "OP",
    "<": "OP",
    ">": "OP",
    "!": "OP",
  };
  return map[ch] || null;
}

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let iterations = 0;

  while (i < source.length) {
    iterations = checkLoop(iterations, line, col);
    const ws = skipWhitespace(source, i, line, col);
    i = ws.pos;
    line = ws.line;
    col = ws.col;
    if (i >= source.length) break;

    if (source[i] === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) {
      const cm = skipComment(source, i, line, col);
      i = cm.pos;
      line = cm.line;
      col = cm.col;
      continue;
    }

    const result = lexToken(source, i, line, col);
    tokens.push(result.token);
    i = result.pos;
    col = result.col;
  }

  tokens.push({ type: "EOF", value: "", line, col });
  return tokens;
}

// ---- AST ----

export type ASTNode =
  | { kind: "Program"; body: ASTNode[] }
  | { kind: "Let"; name: string; value: ASTNode }
  | { kind: "Fn"; name: string; params: string[]; body: ASTNode }
  | { kind: "If"; cond: ASTNode; thenBody: ASTNode[]; elseBody: ASTNode[] }
  | { kind: "While"; cond: ASTNode; body: ASTNode[] }
  | { kind: "Block"; body: ASTNode[] }
  | { kind: "Binary"; op: string; left: ASTNode; right: ASTNode }
  | { kind: "Unary"; op: string; operand: ASTNode }
  | { kind: "Call"; callee: ASTNode; args: ASTNode[] }
  | { kind: "Index"; obj: ASTNode; index: ASTNode }
  | { kind: "Property"; obj: ASTNode; prop: string }
  | { kind: "ArrayLit"; elements: ASTNode[] }
  | { kind: "ObjectLit"; properties: { key: string; value: ASTNode }[] }
  | { kind: "Ident"; name: string }
  | { kind: "Number"; value: number }
  | { kind: "String"; value: string }
  | { kind: "Bool"; value: boolean };

// ---- Parser (imported) ----

import { parse } from "./parser";
export { parse };

// ---- Code Generator (imported) ----

import { generate } from "./codegen";
export { generate };

// ---- Public API ----

export function compile(source: string): string {
  const tokens = lex(source);
  const ast = parse(tokens);
  return generate(ast);
}

// ---- CLI ----

export function runCli(argv: string[]): void {
  const inputFile = argv[2];

  if (!inputFile) {
    console.error("Usage: tuff compile <input.tuff>");
    process.exit(1);
    return;
  }

  try {
    const source = fs.readFileSync(inputFile, "utf-8");
    const output = compile(source);
    console.log(output);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Error: " + errorMessage);
    process.exit(1);
  }
}

if (import.meta.main) {
  runCli(process.argv);
}
