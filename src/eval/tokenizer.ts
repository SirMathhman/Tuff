import {
  parseOperandAt,
  findMatchingClosingParen,
  parseCommaSeparatedArgs,
} from "../parser";
import { findMatchingParen } from "../interpret_helpers";

export type ExprToken = { op?: string; operand?: unknown };

/**
 * Tokenize an expression string into a sequence of operands and operators
 */
export function tokenizeExpression(exprStr: string): ExprToken[] {
  const exprTokens: ExprToken[] = [];
  let pos = 0;
  const L = exprStr.length;

  function skip() {
    while (pos < L && exprStr[pos] === " ") pos++;
  }

  skip();
  const firstMatch = parseOperandAt(exprStr, pos);
  if (!firstMatch) throw new Error("invalid expression");
  exprTokens.push({ operand: firstMatch.operand });

  pos += firstMatch.len;
  skip();

  while (pos < L) {
    skip();
    // Check for function application (e.g., `func()(args)`)
    if (exprStr[pos] === "(") {
      const endIdx = findMatchingClosingParen(exprStr, pos);
      if (endIdx === -1) throw new Error("unbalanced parentheses in call");
      const inner = exprStr.slice(pos + 1, endIdx);
      const args = parseCommaSeparatedArgs(inner);
      exprTokens.push({ op: "call", operand: { callApp: args } });
      // call does not change the lastPrimary (the function being applied)
      pos = endIdx + 1;
      skip();
      continue;
    }
    // Check for field access (e.g., `expr.field`)
    if (exprStr[pos] === ".") {
      pos++;
      // Parse field name
      const fieldMatch = exprStr.slice(pos).match(/^([a-zA-Z_]\w*)/);
      if (!fieldMatch)
        throw new Error("invalid field access: expected field name after .");
      const fieldName = fieldMatch[1];
      // For field access, push the field operator.
      // The operand will be resolved during evaluation (not by referencing the
      // potentially-shared parse-time object) to avoid duplicated references.
      exprTokens.push({ op: `.${fieldName}`, operand: undefined });
      pos += fieldName.length;
      skip();
      continue;
    }

    // Check for indexing operator (e.g., `arr[index]`)
    if (exprStr[pos] === "[") {
      const endIdx = findMatchingParen(exprStr, pos, "[", "]");
      if (endIdx === -1) throw new Error("unbalanced brackets in index");
      const inner = exprStr.slice(pos + 1, endIdx);
      exprTokens.push({ op: "index", operand: { indexExpr: inner } });
      pos = endIdx + 1;
      skip();
      continue;
    }

    // Check for `is` operator (type test)
    if (
      exprStr.slice(pos).startsWith("is") &&
      !/[a-zA-Z0-9_]/.test(exprStr[pos + 2] || "")
    ) {
      pos += 2;
      skip();
      // Parse the right-side operand (we'll treat bare identifiers that look like
      // types specially during evaluation)
      const next = parseOperandAt(exprStr, pos);
      if (!next) throw new Error("invalid operand after operator");
      exprTokens.push({ op: "is", operand: next.operand });
      pos += next.len;
      skip();
      continue;
    }

    // support multi-char operators: || && == != <= >=
    let op: string | undefined = undefined;
    if (exprStr.startsWith("||", pos)) {
      op = "||";
      pos += 2;
    } else if (exprStr.startsWith("&&", pos)) {
      op = "&&";
      pos += 2;
    } else if (exprStr.startsWith("==", pos)) {
      op = "==";
      pos += 2;
    } else if (exprStr.startsWith("!=", pos)) {
      op = "!=";
      pos += 2;
    } else if (exprStr.startsWith("<=", pos)) {
      op = "<=";
      pos += 2;
    } else if (exprStr.startsWith(">=", pos)) {
      op = ">=";
      pos += 2;
    } else {
      const ch = exprStr[pos];
      if (!/[+\-*/%<>]/.test(ch)) throw new Error("invalid operator");
      op = ch;
      pos++;
    }
    skip();
    const next = parseOperandAt(exprStr, pos);
    if (!next) throw new Error("invalid operand after operator");
    exprTokens.push({ op, operand: next.operand });

    pos += next.len;
    skip();
  }

  return exprTokens;
}

/**
 * Extract operands and operators from tokens
 */
export function splitTokensToOperandsAndOps(tokens: ExprToken[]): {
  operands: unknown[];
  ops: string[];
} {
  const operands = tokens.map((t) => t.operand);
  const ops: string[] = [];
  for (let i = 1; i < tokens.length; i++) ops.push(tokens[i].op!);
  return { operands, ops };
}
