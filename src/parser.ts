import type { Expr, Statement } from "./ast";
import type { CompileError } from "./errors";
import { isCompileError } from "./errors";
import type { Token, Loc } from "./lexer";

export type ParseResult = Expr | CompileError;
export type StatementResult = Statement | CompileError;

export interface Parser {
  tokens: Token[];
  pos: number;
}

function peek(p: Parser): Token {
  return p.tokens[p.pos]!;
}

function advance(p: Parser): Token {
  const t = p.tokens[p.pos]!;
  p.pos++;
  return t;
}

function expectPunct(p: Parser, value: string): CompileError | null {
  const t = peek(p);
  if (t.kind === "punct" && t.value === value) {
    advance(p);
    return null;
  }
  return {
    kind: "parse",
    location: t.loc,
    message: `Expected '${value}' but got '${t.kind === "punct" ? t.value : t.kind}'`,
  };
}

export function parseExpr(tokens: Token[]): ParseResult {
  const p: Parser = { tokens, pos: 0 };
  const expr = parseLogical(p);
  if (isCompileError(expr)) return expr;
  const t = peek(p);
  if (t.kind !== "eof") {
    return {
      kind: "parse",
      location: t.loc,
      message: `Unexpected trailing token '${t.kind === "punct" ? t.value : t.kind}'`,
    };
  }
  return expr;
}

function parseLogical(p: Parser): ParseResult {
  const leftResult = parseBinary(p);
  if (isCompileError(leftResult)) return leftResult;
  let left: Expr = leftResult;
  for (;;) {
    const t = peek(p);
    if (t.kind === "punct" && (t.value === "||" || t.value === "&&")) {
      advance(p);
      const rightResult = parseBinary(p);
      if (isCompileError(rightResult)) return rightResult;
      left = { kind: "binary", op: t.value, left, right: rightResult };
    } else {
      break;
    }
  }
  return left;
}

const BINARY_OPS = new Set(["==", "!=", "<=", ">=", "+", "-", "*", "/", "<", ">"]);

function parseBinary(p: Parser): ParseResult {
  const leftResult = parseUnary(p);
  if (isCompileError(leftResult)) return leftResult;
  let left: Expr = leftResult;
  for (;;) {
    const t = peek(p);
    if (t.kind === "punct" && BINARY_OPS.has(t.value)) {
      advance(p);
      const rightResult = parseUnary(p);
      if (isCompileError(rightResult)) return rightResult;
      left = { kind: "binary", op: t.value, left, right: rightResult };
    } else {
      break;
    }
  }
  return left;
}

function parseUnary(p: Parser): ParseResult {
  const t = peek(p);
  if (t.kind === "punct" && t.value === "&mut") {
    advance(p);
    const target = parseUnary(p);
    if (isCompileError(target)) return target;
    return { kind: "addressOf", target };
  }
  if (t.kind === "punct" && t.value === "&") {
    advance(p);
    const target = parseUnary(p);
    if (isCompileError(target)) return target;
    return { kind: "addressOf", target };
  }
  if (t.kind === "punct" && t.value === "*") {
    advance(p);
    const target = parseUnary(p);
    if (isCompileError(target)) return target;
    return { kind: "deref", target };
  }
  return parsePostfix(p);
}

function parsePostfix(p: Parser): ParseResult {
  const primaryResult = parsePrimary(p);
  if (isCompileError(primaryResult)) return primaryResult;
  let expr: Expr = primaryResult;
  for (;;) {
    const t = peek(p);
    if (t.kind === "punct" && t.value === ".") {
      advance(p);
      const nameTok = peek(p);
      if (nameTok.kind !== "ident") {
        return { kind: "parse", location: nameTok.loc, message: "Expected identifier after '.'" };
      }
      advance(p);
      expr = { kind: "member", object: expr, property: nameTok.name };
    } else if (t.kind === "punct" && t.value === "(") {
      advance(p);
      const args: Expr[] = [];
      if (peek(p).kind !== "punct" || peek(p).value !== ")") {
        const argResult = parseLogical(p);
        if (isCompileError(argResult)) return argResult;
        args.push(argResult);
        while (peek(p).kind === "punct" && peek(p).value === ",") {
          advance(p);
          const argResult = parseLogical(p);
          if (isCompileError(argResult)) return argResult;
          args.push(argResult);
        }
      }
      const err = expectPunct(p, ")");
      if (err) return err;
      expr = { kind: "call", callee: expr, args };
    } else {
      break;
    }
  }
  return expr;
}

function parsePrimary(p: Parser): ParseResult {
  const t = peek(p);
  if (t.kind === "punct" && t.value === "(") {
    advance(p);
    const expr = parseLogical(p);
    if (isCompileError(expr)) return expr;
    const err = expectPunct(p, ")");
    if (err) return err;
    return expr;
  }
  if (t.kind === "string") {
    advance(p);
    return { kind: "lit", value: t.value };
  }
  if (t.kind === "number") {
    advance(p);
    return { kind: "lit", value: t.value };
  }
  if (t.kind === "ident") {
    advance(p);
    return { kind: "ident", name: t.name };
  }
  if (t.kind === "keyword" && (t.value === "true" || t.value === "false")) {
    advance(p);
    return { kind: "ident", name: t.value };
  }
  return {
    kind: "parse",
    location: t.loc,
    message: `Unexpected token '${t.kind === "punct" ? t.value : t.kind}'`,
  };
}

export function parseStatement(p: Parser): StatementResult {
  const t = peek(p);

  // Block
  if (t.kind === "punct" && t.value === "{") {
    advance(p);
    const stmts: Statement[] = [];
    while (peek(p).kind !== "punct" || peek(p).value !== "}") {
      if (peek(p).kind === "eof") {
        return { kind: "parse", location: peek(p).loc, message: "Unexpected end of input, expected '}'" };
      }
      const r = parseStatement(p);
      if (isCompileError(r)) return r;
      stmts.push(r);
      // Consume optional semicolon
      if (peek(p).kind === "punct" && peek(p).value === ";") {
        advance(p);
      }
    }
    const err = expectPunct(p, "}");
    if (err) return err;
    return { kind: "block", statements: stmts };
  }

  // let mut
  if (t.kind === "keyword" && t.value === "let") {
    advance(p);
    const next = peek(p);
    if (next.kind === "keyword" && next.value === "mut") {
      advance(p);
      const nameTok = peek(p);
      if (nameTok.kind !== "ident") {
        return { kind: "parse", location: nameTok.loc, message: "Expected identifier after 'let mut'" };
      }
      advance(p);
      const err = expectPunct(p, "=");
      if (err) return err;
      const init = parseLogical(p);
      if (isCompileError(init)) return init;
      return { kind: "letMut", name: nameTok.name, init };
    }
    // let
    const nameTok = peek(p);
    if (nameTok.kind !== "ident") {
      return { kind: "parse", location: nameTok.loc, message: "Expected identifier after 'let'" };
    }
    advance(p);
    const err = expectPunct(p, "=");
    if (err) return err;
    const init = parseLogical(p);
    if (isCompileError(init)) return init;
    return { kind: "let", name: nameTok.name, init };
  }

  // *x = value (derefAssign)
  if (t.kind === "punct" && t.value === "*") {
    const save = p.pos;
    advance(p);
    const nameTok = peek(p);
    if (nameTok.kind === "ident") {
      advance(p);
      const eq = peek(p);
      if (eq.kind === "punct" && eq.value === "=") {
        advance(p);
        const value = parseLogical(p);
        if (isCompileError(value)) return value;
        return { kind: "derefAssign", target: { kind: "ident", name: nameTok.name }, value };
      }
    }
    p.pos = save;
  }

  // x = value (assign)
  if (t.kind === "ident") {
    const save = p.pos;
    advance(p);
    const eq = peek(p);
    if (eq.kind === "punct" && eq.value === "=") {
      advance(p);
      const value = parseLogical(p);
      if (isCompileError(value)) return value;
      return { kind: "assign", name: t.name, value };
    }
    p.pos = save;
  }

  // Expression statement
  const expr = parseLogical(p);
  if (isCompileError(expr)) return expr;
  return { kind: "expr", value: expr };
}

export function parseProgram(tokens: Token[]): {
  statements: Statement[];
  finalExpr: Statement;
} | CompileError {
  const p: Parser = { tokens, pos: 0 };
  const statements: Statement[] = [];

  while (peek(p).kind !== "eof") {
    const r = parseStatement(p);
    if (isCompileError(r)) return r;
    statements.push(r);
    if (peek(p).kind === "punct" && peek(p).value === ";") {
      advance(p);
    }
  }

  if (statements.length === 0) {
    return { statements: [], finalExpr: { kind: "expr", value: { kind: "lit", value: "0" } } };
  }

  const finalExpr = statements[statements.length - 1]!;
  return { statements: statements.slice(0, -1), finalExpr };
}

export function extractExpression(source: string): string {
  const lines = source.split("\n");
  const exprLines: string[] = [];
  let inModule = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inModule) {
      braceDepth += (trimmed.match(/\{/g) || []).length;
      braceDepth -= (trimmed.match(/\}/g) || []).length;
      if (braceDepth <= 0) inModule = false;
      continue;
    }

    if (trimmed.startsWith("module ")) {
      inModule = true;
      braceDepth =
        (trimmed.match(/\{/g) || []).length -
        (trimmed.match(/\}/g) || []).length;
      continue;
    }
    if (trimmed.startsWith("declare ")) continue;
    if (trimmed.startsWith("in let ")) continue;

    exprLines.push(line);
  }

  return exprLines.join("\n").trim();
}
