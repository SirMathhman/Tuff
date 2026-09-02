import type { Expr, Statement } from "./ast";
import type { CompileError } from "./errors";
import { isCompileError } from "./errors";

export type ParseResult = Expr | CompileError;
export type StatementResult = Statement | CompileError;

export interface Parser {
  src: string;
  pos: number;
}

export function parseExpr(s: string): ParseResult {
  const p: Parser = { src: s.trim(), pos: 0 };
  const expr = parseBinary(p);
  if (isCompileError(expr)) return expr;
  skipWs(p);
  if (p.pos < p.src.length) {
    return {
      kind: "parse",
      location: { line: 1, column: p.pos },
      message: `Unexpected trailing input at position ${p.pos}`,
    };
  }
  return expr;
}

function parseBinary(p: Parser): ParseResult {
  const leftResult = parseUnary(p);
  if (isCompileError(leftResult)) return leftResult;
  let left: Expr = leftResult;
  for (;;) {
    const op = tryBinaryOp(p);
    if (!op) break;
    const rightResult = parseUnary(p);
    if (isCompileError(rightResult)) return rightResult;
    left = { kind: "binary", op, left, right: rightResult };
  }
  return left;
}

function tryBinaryOp(p: Parser): string | null {
  skipWs(p);
  const rest = p.src.slice(p.pos);
  if (rest.startsWith("==")) {
    p.pos += 2;
    return "==";
  }
  if (rest.startsWith("!=")) {
    p.pos += 2;
    return "!=";
  }
  if (rest.startsWith("<=")) {
    p.pos += 2;
    return "<=";
  }
  if (rest.startsWith(">=")) {
    p.pos += 2;
    return ">=";
  }
  if (rest.startsWith("+")) {
    p.pos += 1;
    return "+";
  }
  if (rest.startsWith("-")) {
    p.pos += 1;
    return "-";
  }
  if (rest.startsWith("*")) {
    p.pos += 1;
    return "*";
  }
  if (rest.startsWith("/")) {
    p.pos += 1;
    return "/";
  }
  if (rest.startsWith("<")) {
    p.pos += 1;
    return "<";
  }
  if (rest.startsWith(">")) {
    p.pos += 1;
    return ">";
  }
  return null;
}

function parseUnary(p: Parser): ParseResult {
  skipWs(p);
  if (p.src.startsWith("&mut ", p.pos)) {
    p.pos += 5;
    const target = parseUnary(p);
    if (isCompileError(target)) return target;
    return { kind: "addressOf", target };
  }
  if (p.src[p.pos] === "&") {
    p.pos += 1;
    const target = parseUnary(p);
    if (isCompileError(target)) return target;
    return { kind: "addressOf", target };
  }
  if (p.src[p.pos] === "*") {
    p.pos += 1;
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
    skipWs(p);
    if (p.src[p.pos] === ".") {
      p.pos += 1;
      const property = parseIdent(p);
      expr = { kind: "member", object: expr, property };
    } else if (p.src[p.pos] === "(") {
      p.pos += 1;
      const args: Expr[] = [];
      skipWs(p);
      if (p.src[p.pos] !== ")") {
        const argResult = parseBinary(p);
        if (isCompileError(argResult)) return argResult;
        args.push(argResult);
        while (p.src[p.pos] === ",") {
          p.pos += 1;
          skipWs(p);
          const argResult = parseBinary(p);
          if (isCompileError(argResult)) return argResult;
          args.push(argResult);
        }
      }
      skipWs(p);
      if (p.src[p.pos] !== ")")
        return {
          kind: "parse",
          location: { line: 1, column: p.pos },
          message: "Expected ')'",
        };
      p.pos += 1;
      expr = { kind: "call", callee: expr, args };
    } else {
      break;
    }
  }
  return expr;
}

function parsePrimary(p: Parser): ParseResult {
  skipWs(p);
  const ch = p.src[p.pos]!;
  if (ch === "(") {
    p.pos += 1;
    const expr = parseBinary(p);
    if (isCompileError(expr)) return expr;
    skipWs(p);
    if (p.src[p.pos] !== ")")
      return {
        kind: "parse",
        location: { line: 1, column: p.pos },
        message: "Expected ')'",
      };
    p.pos += 1;
    return expr;
  }
  if (ch === '"') {
    const end = p.src.indexOf('"', p.pos + 1);
    if (end === -1)
      return {
        kind: "parse",
        location: { line: 1, column: p.pos },
        message: "Unterminated string literal",
      };
    const value = p.src.slice(p.pos, end + 1);
    p.pos = end + 1;
    return { kind: "lit", value };
  }
  if (/[0-9]/.test(ch)) {
    let end = p.pos;
    while (end < p.src.length && /[0-9]/.test(p.src[end]!)) end++;
    const value = p.src.slice(p.pos, end);
    p.pos = end;
    return { kind: "lit", value };
  }
  if (/[a-zA-Z_]/.test(ch)) {
    const name = parseIdent(p);
    return { kind: "ident", name };
  }
  return {
    kind: "parse",
    location: { line: 1, column: p.pos },
    message: `Unexpected character '${ch}'`,
  };
}

function parseIdent(p: Parser): string {
  let end = p.pos;
  while (end < p.src.length && /[\w]/.test(p.src[end]!)) end++;
  const name = p.src.slice(p.pos, end);
  p.pos = end;
  return name;
}

function skipWs(p: Parser) {
  while (p.pos < p.src.length && /\s/.test(p.src[p.pos]!)) p.pos++;
}

export function parseStatement(s: string): StatementResult {
  const trimmed = s.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return { kind: "block", statements: [] };
    const parts = splitTopLevel(inner, ";")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    const stmts: Statement[] = [];
    for (const part of parts) {
      const r = parseStatement(part);
      if (isCompileError(r)) return r;
      stmts.push(r);
    }
    return { kind: "block", statements: stmts };
  }
  const letMutMatch = trimmed.match(/^let\s+mut\s+(\w+)\s*=\s*(.*)$/);
  if (letMutMatch) {
    const init = parseExpr(letMutMatch[2]!);
    if (isCompileError(init)) return init;
    return { kind: "letMut", name: letMutMatch[1]!, init };
  }
  const letMatch = trimmed.match(/^let\s+(\w+)\s*=\s*(.*)$/);
  if (letMatch) {
    const init = parseExpr(letMatch[2]!);
    if (isCompileError(init)) return init;
    return { kind: "let", name: letMatch[1]!, init };
  }
  const derefAssignMatch = trimmed.match(/^\*(\w+)\s*=\s*(.*)$/);
  if (derefAssignMatch) {
    const value = parseExpr(derefAssignMatch[2]!);
    if (isCompileError(value)) return value;
    return {
      kind: "derefAssign",
      target: { kind: "ident", name: derefAssignMatch[1]! },
      value,
    };
  }
  const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
  if (assignMatch) {
    const value = parseExpr(assignMatch[2]!);
    if (isCompileError(value)) return value;
    return { kind: "assign", name: assignMatch[1]!, value };
  }
  const expr = parseExpr(trimmed);
  if (isCompileError(expr)) return expr;
  return { kind: "expr", value: expr };
}

export function splitStatements(source: string): {
  statements: string[];
  finalExpr: string;
} {
  const parts = splitTopLevel(source, ";");
  const statements = parts
    .slice(0, -1)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const finalExpr = parts[parts.length - 1]!.trim();
  return { statements, finalExpr };
}

export function splitTopLevel(source: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of source) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;

    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = "";
    } else if (ch === "}" && depth === 0) {
      current += ch;
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

export function findUnbalancedParen(
  s: string,
): { line: number; column: number } | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) {
      return { line: 1, column: i + 1 };
    }
  }
  if (depth !== 0) {
    return { line: 1, column: s.length };
  }
  return null;
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
