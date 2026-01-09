import {
  parseOperandAt,
  findMatchingClosingParen,
  parseCommaSeparatedArgs,
} from "../parser";
import { findMatchingParen } from "../interpreter_helpers";
import type { RuntimeValue } from "../runtime/types";

interface ExprToken {
  op?: string;
  operand?: RuntimeValue;
}

export type { ExprToken };

interface TokenizeState {
  exprStr: string;
  pos: number;
  L: number;
  tokens: ExprToken[];
}

interface SplitResult {
  operands: RuntimeValue[];
  ops: string[];
}

function skipSpaces(state: TokenizeState) {
  while (state.pos < state.L && state.exprStr[state.pos] === " ") state.pos++;
}

function parseOperandOrThrow(state: TokenizeState, msg: string) {
  const match = parseOperandAt(state.exprStr, state.pos);
  if (!match) throw new Error(msg);
  return match;
}

function tryParseCallAt(state: TokenizeState): boolean {
  const { exprStr } = state;
  if (exprStr[state.pos] !== "(") return false;
  const endIdx = findMatchingClosingParen(exprStr, state.pos);
  if (endIdx === -1) throw new Error("unbalanced parentheses in call");
  const inner = exprStr.slice(state.pos + 1, endIdx);
  const args = parseCommaSeparatedArgs(inner);
  state.tokens.push({ op: "call", operand: { callApp: args } });
  state.pos = endIdx + 1;
  skipSpaces(state);
  return true;
}

function tryParseFieldAt(state: TokenizeState): boolean {
  const { exprStr } = state;
  if (exprStr[state.pos] !== ".") return false;
  state.pos++;
  const fieldMatch = exprStr.slice(state.pos).match(/^([a-zA-Z_]\w*)/);
  if (!fieldMatch)
    throw new Error("invalid field access: expected field name after .");
  const fieldName = fieldMatch[1];
  state.tokens.push({ op: `.${fieldName}`, operand: undefined });
  state.pos += fieldName.length;
  skipSpaces(state);
  return true;
}

function tryParseIndexAt(state: TokenizeState): boolean {
  const { exprStr } = state;
  if (exprStr[state.pos] !== "[") return false;
  const endIdx = findMatchingParen(exprStr, {
    start: state.pos,
    open: "[",
    close: "]",
  });
  if (endIdx === -1) throw new Error("unbalanced brackets in index");
  const inner = exprStr.slice(state.pos + 1, endIdx);
  state.tokens.push({ op: "index", operand: { indexExpr: inner } });
  state.pos = endIdx + 1;
  skipSpaces(state);
  return true;
}

function tryParseIsOperator(state: TokenizeState): boolean {
  const { exprStr } = state;
  if (!exprStr.slice(state.pos).startsWith("is")) return false;
  if (/[a-zA-Z0-9_]/.test(exprStr[state.pos + 2] || "")) return false;
  state.pos += 2;
  skipSpaces(state);
  const next = parseOperandOrThrow(state, "invalid operand after operator");
  state.tokens.push({ op: "is", operand: next.operand });
  state.pos += next.len;
  skipSpaces(state);
  return true;
}

function parseBinaryOperator(state: TokenizeState) {
  const { exprStr } = state;
  // support multi-char operators: || && == != <= >=
  let op: string | undefined = undefined;
  if (exprStr.startsWith("||", state.pos)) {
    op = "||";
    state.pos += 2;
  } else if (exprStr.startsWith("&&", state.pos)) {
    op = "&&";
    state.pos += 2;
  } else if (exprStr.startsWith("==", state.pos)) {
    op = "==";
    state.pos += 2;
  } else if (exprStr.startsWith("!=", state.pos)) {
    op = "!=";
    state.pos += 2;
  } else if (exprStr.startsWith("<=", state.pos)) {
    op = "<=";
    state.pos += 2;
  } else if (exprStr.startsWith(">=", state.pos)) {
    op = ">=";
    state.pos += 2;
  } else {
    const ch = exprStr[state.pos];
    if (!/[+\-*/%<>]/.test(ch)) throw new Error("invalid operator");
    op = ch;
    state.pos++;
  }
  skipSpaces(state);
  const next = parseOperandOrThrow(state, "invalid operand after operator");
  state.tokens.push({ op, operand: next.operand });
  state.pos += next.len;
  skipSpaces(state);
}

/**
 * Tokenize an expression string into a sequence of operands and operators
 */
export function tokenizeExpression(exprStr: string): ExprToken[] {
  const state: TokenizeState = {
    exprStr,
    pos: 0,
    L: exprStr.length,
    tokens: [],
  };

  skipSpaces(state);
  const firstMatch = parseOperandOrThrow(state, "invalid expression");
  state.tokens.push({ operand: firstMatch.operand });
  state.pos += firstMatch.len;
  skipSpaces(state);

  while (state.pos < state.L) {
    skipSpaces(state);
    if (tryParseCallAt(state)) continue;
    if (tryParseFieldAt(state)) continue;
    if (tryParseIndexAt(state)) continue;
    if (tryParseIsOperator(state)) continue;
    parseBinaryOperator(state);
  }

  return state.tokens;
}

/**
 * Extract operands and operators from tokens
 */
export function splitTokensToOperandsAndOps(tokens: ExprToken[]): SplitResult {
  const operands = tokens.map((t) => t.operand);
  const ops: string[] = [];
  for (let i = 1; i < tokens.length; i++) ops.push(tokens[i].op!);
  return { operands, ops };
}
