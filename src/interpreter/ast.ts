/* eslint-disable max-lines, complexity, no-restricted-syntax */
/**
 * Lightweight AST for Tuff expressions.
 * Designed to reduce repeated string parsing while maintaining correctness.
 */

export interface ASTNumber {
  kind: "number";
  value: number;
  suffix?: string;
}

export interface ASTIdentifier {
  kind: "identifier";
  name: string;
}

export interface ASTBoolean {
  kind: "boolean";
  value: boolean;
}

export interface ASTBinaryOp {
  kind: "binary-op";
  op: string;
  left: ASTNode;
  right: ASTNode;
}

export interface ASTUnaryNot {
  kind: "unary-not";
  operand: ASTNode;
}

export interface ASTCall {
  kind: "call";
  func: ASTNode;
  args: ASTNode[];
}

export interface ASTMethodCall {
  kind: "method-call";
  receiver: ASTNode;
  method: string;
  args: ASTNode[];
}

export interface ASTIndex {
  kind: "index";
  target: ASTNode;
  index: ASTNode;
}

export interface ASTFieldAccess {
  kind: "field-access";
  object: ASTNode;
  field: string;
}

export interface ASTDeref {
  kind: "deref";
  operand: ASTNode;
}

export interface ASTAddressOf {
  kind: "address-of";
  operand: ASTNode;
  mutable?: boolean;
}

export interface ASTIfExpr {
  kind: "if-expr";
  condition: ASTNode;
  then: ASTNode;
  else: ASTNode;
}

export interface ASTArrayLiteral {
  kind: "array-literal";
  elements: ASTNode[];
}

export interface ASTStructLiteral {
  kind: "struct-literal";
  type: string;
  fields: ASTNode[];
}

export type ASTNode =
  | ASTNumber
  | ASTIdentifier
  | ASTBoolean
  | ASTBinaryOp
  | ASTUnaryNot
  | ASTCall
  | ASTMethodCall
  | ASTIndex
  | ASTFieldAccess
  | ASTDeref
  | ASTAddressOf
  | ASTIfExpr
  | ASTArrayLiteral
  | ASTStructLiteral;

/**
 * Parse a string expression into an AST.
 * Dispatches to lower-level parsers by precedence.
 */
export function parseExpressionToAST(s: string): ASTNode {
  const trimmed = s.trim();

  // Try logical operators (lowest precedence)
  const logicalResult = tryParseLogicalOp(trimmed);
  if (logicalResult) return logicalResult;

  // Try comparison operators
  const compResult = tryParseComparison(trimmed);
  if (compResult) return compResult;

  // Try arithmetic operators
  const arithResult = parseArithmeticToAST(trimmed);
  if (arithResult) return arithResult;

  // Try prefix and unary operators
  const prefixResult = tryParsePrefix(trimmed);
  if (prefixResult) return prefixResult;

  // Try literals (before postfix, so "true"/"false" aren't caught as identifiers)
  const literalResult = tryParseLiteral(trimmed);
  if (literalResult) return literalResult;

  // Try postfix operations (field access, indexing, method calls)
  const postfixResult = parsePostfixToAST(trimmed);
  if (postfixResult) return postfixResult;

  // Try grouping
  const groupResult = tryParseGrouping(trimmed);
  if (groupResult) return groupResult;

  // Fallback: identifier
  return { kind: "identifier", name: trimmed };
}

function tryParseLogicalOp(s: string): ASTNode | undefined {
  const orOp = findTopLevelTwoCharOp(s, ["||"]);
  if (orOp) {
    return {
      kind: "binary-op",
      op: "||",
      left: parseExpressionToAST(s.slice(0, orOp.idx)),
      right: parseExpressionToAST(s.slice(orOp.idx + 2)),
    };
  }

  const andOp = findTopLevelTwoCharOp(s, ["&&"]);
  if (andOp) {
    return {
      kind: "binary-op",
      op: "&&",
      left: parseExpressionToAST(s.slice(0, andOp.idx)),
      right: parseExpressionToAST(s.slice(andOp.idx + 2)),
    };
  }

  return undefined;
}

function tryParseComparison(s: string): ASTNode | undefined {
  const compOp = findTopLevelComparison(s);
  if (compOp) {
    return {
      kind: "binary-op",
      op: compOp.op,
      left: parseExpressionToAST(s.slice(0, compOp.idx)),
      right: parseExpressionToAST(s.slice(compOp.idx + compOp.op.length)),
    };
  }
  return undefined;
}

function tryParsePrefix(s: string): ASTNode | undefined {
  // Unary not
  if (s.startsWith("!")) {
    return {
      kind: "unary-not",
      operand: parseExpressionToAST(s.slice(1).trim()),
    };
  }

  // Deref
  if (s.startsWith("*")) {
    return {
      kind: "deref",
      operand: parseExpressionToAST(s.slice(1).trim()),
    };
  }

  // Address-of
  if (s.startsWith("&")) {
    const rest = s.slice(1).trim();
    const mutPrefix = tryExtractMutPrefix(rest);
    const actualRest = mutPrefix
      ? rest.slice(rest.indexOf(" ") + 1).trim()
      : rest;
    return {
      kind: "address-of",
      operand: parseExpressionToAST(actualRest),
      mutable: mutPrefix,
    };
  }

  return undefined;
}

function tryExtractMutPrefix(s: string): boolean {
  return s.startsWith("mut ");
}

function tryParseGrouping(s: string): ASTNode | undefined {
  if (
    (s.startsWith("(") || s.startsWith("{")) &&
    findMatchingParen(s, 0) === s.length - 1
  ) {
    return parseExpressionToAST(s.slice(1, -1));
  }
  return undefined;
}

function tryParseLiteral(s: string): ASTNode | undefined {
  // Boolean literals
  if (s === "true") {
    return { kind: "boolean", value: true };
  }
  if (s === "false") {
    return { kind: "boolean", value: false };
  }

  // Numeric literal
  const { numStr, rest: suffix } = splitNumberAndSuffix(s);
  if (numStr !== "") {
    const value = Number(numStr);
    if (Number.isFinite(value)) {
      return {
        kind: "number",
        value,
        suffix: suffix !== "" ? suffix : undefined,
      };
    }
  }

  return undefined;
}

/**
 * Parse arithmetic expressions (+ - * /) into an AST.
 * Respects precedence: * / bind tighter than + -.
 */
function parseArithmeticToAST(s: string): ASTNode | undefined {
  const tokens = tokenizeArithmetic(s);
  if (!tokens || tokens.length < 3) return undefined;

  // Build AST respecting precedence
  // First pass: handle * and / (higher precedence)
  const afterMulDiv: (ASTNode | string)[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    let operand = parseExpressionToAST(tokens[i]);
    while (
      i + 1 < tokens.length &&
      (tokens[i + 1] === "*" || tokens[i + 1] === "/")
    ) {
      const op = tokens[i + 1];
      const right = parseExpressionToAST(tokens[i + 2]);
      operand = { kind: "binary-op", op, left: operand, right };
      i += 2;
    }
    afterMulDiv.push(operand);
    if (i + 1 < tokens.length) afterMulDiv.push(tokens[i + 1]);
  }

  // Second pass: handle + and - (left-to-right)
  let result = afterMulDiv[0] as ASTNode;
  for (let i = 1; i < afterMulDiv.length; i += 2) {
    const op = afterMulDiv[i] as string;
    const right = afterMulDiv[i + 1] as ASTNode;
    result = { kind: "binary-op", op, left: result, right };
  }

  return result;
}

/**
 * Parse postfix operations: field access, indexing, method calls.
 */
function parsePostfixToAST(s: string): ASTNode | undefined {
  const baseParse = parsePostfixBase(s);
  if (!baseParse) return undefined;

  let base = baseParse.node;
  let remaining = s.slice(baseParse.consumed);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    remaining = remaining.trim();
    if (!remaining) break;

    const ch = remaining[0];
    if (ch === ".") {
      const fieldParse = parsePostfixField(remaining.slice(1), base);
      if (!fieldParse) break;
      base = fieldParse.node;
      remaining = remaining.slice(fieldParse.consumed + 1);
    } else if (ch === "[") {
      const indexParse = parsePostfixIndex(remaining, base);
      if (!indexParse) break;
      base = indexParse.node;
      remaining = remaining.slice(indexParse.consumed);
    } else if (ch === "(") {
      const callParse = parsePostfixCall(remaining, base);
      if (!callParse) break;
      base = callParse.node;
      remaining = remaining.slice(callParse.consumed);
    } else {
      break;
    }
  }

  // Only return if we consumed the entire string
  return remaining.trim() === "" ? base : undefined;
}

interface PostfixParse {
  node: ASTNode;
  consumed: number;
}

function parsePostfixBase(s: string): PostfixParse | undefined {
  // Try to match identifier, grouped expr, or braced expr at start
  let i = 0;
  const n = s.length;

  // Identifier
  if (i < n && isIdentifierStartCode(s.charCodeAt(i))) {
    const start = i;
    i++;
    while (i < n && isIdentifierPartCode(s.charCodeAt(i))) i++;
    return {
      node: { kind: "identifier", name: s.slice(start, i) },
      consumed: i,
    };
  }

  // Grouped expr (paren or brace)
  if (i < n && (s[i] === "(" || s[i] === "{")) {
    const close = findMatchingParen(s, i);
    if (close < 0) return undefined;
    const inner = s.slice(i + 1, close);
    return {
      node: parseExpressionToAST(inner),
      consumed: close + 1,
    };
  }

  return undefined;
}

function parsePostfixField(
  remaining: string,
  base: ASTNode
): PostfixParse | undefined {
  // Skip whitespace
  let i = 0;
  while (i < remaining.length && isWhitespace(remaining[i])) i++;

  const nameStart = i;
  while (i < remaining.length && isIdentifierPartCode(remaining.charCodeAt(i))) {
    i++;
  }

  if (i === nameStart) return undefined;
  const fieldName = remaining.slice(nameStart, i);

  // Check for method call (func call following field name)
  const afterField = remaining.slice(i).trim();
  if (afterField.startsWith("(")) {
    const close = findMatchingParen(afterField, 0);
    if (close < 0) return undefined;
    const argsStr = afterField.slice(1, close);
    const args =
      argsStr === ""
        ? []
        : splitTopLevel(argsStr, ",").map((arg) =>
            parseExpressionToAST(arg.trim())
          );
    return {
      node: {
        kind: "method-call",
        receiver: base,
        method: fieldName,
        args,
      },
      consumed: i + close + 1,
    };
  }

  // Just field access
  return {
    node: { kind: "field-access", object: base, field: fieldName },
    consumed: i,
  };
}

function parsePostfixIndex(
  remaining: string,
  base: ASTNode
): PostfixParse | undefined {
  const close = findMatchingParen(remaining, 0);
  if (close < 0) return undefined;
  const indexStr = remaining.slice(1, close);
  return {
    node: {
      kind: "index",
      target: base,
      index: parseExpressionToAST(indexStr),
    },
    consumed: close + 1,
  };
}

function parsePostfixCall(
  remaining: string,
  base: ASTNode
): PostfixParse | undefined {
  const close = findMatchingParen(remaining, 0);
  if (close < 0) return undefined;
  const argsStr = remaining.slice(1, close);
  const args =
    argsStr === ""
      ? []
      : splitTopLevel(argsStr, ",").map((arg) =>
          parseExpressionToAST(arg.trim())
        );
  return {
    node: { kind: "call", func: base, args },
    consumed: close + 1,
  };
}

function isWhitespace(ch: string | undefined): boolean {
  return ch !== undefined && " \t\n\r".includes(ch);
}

/**
 * Tokenize arithmetic expression into operands and operators.
 */
function tokenizeArithmetic(s: string): string[] | undefined {
  const tokens: string[] = [];
  let i = 0;
  let expectOperand = true;

  while (i < s.length) {
    // Skip whitespace
    i = skipWhitespace(s, i);
    if (i >= s.length) break;

    if (expectOperand) {
      // Parse operand (number, identifier, grouped expr, unary deref)
      const operand = parseOperandAt(s, i);
      if (!operand) return undefined;
      tokens.push(operand.token);
      i = operand.next;
      expectOperand = false;
    } else {
      // Parse operator
      const ch = s[i];
      if ("+-*/".includes(ch)) {
        tokens.push(ch);
        i++;
        expectOperand = true;
      } else {
        return undefined;
      }
    }
  }

  return expectOperand ? undefined : tokens.length >= 3 ? tokens : undefined;
}

interface ParseResult {
  token: string;
  next: number;
}

function parseOperandAt(s: string, i: number): ParseResult | undefined {
  const n = s.length;

  // Skip whitespace
  i = skipWhitespace(s, i);

  // Grouped expression
  if (i < n && (s[i] === "(" || s[i] === "{")) {
    const close = findMatchingParen(s, i);
    if (close < 0) return undefined;
    return { token: s.slice(i, close + 1), next: close + 1 };
  }

  // Unary deref
  if (i < n && s[i] === "*") {
    let j = i + 1;
    j = skipWhitespace(s, j);
    if (j < n && (s[j] === "(" || s[j] === "{")) {
      const close = findMatchingParen(s, j);
      if (close < 0) return undefined;
      return { token: s.slice(i, close + 1), next: close + 1 };
    }
    if (j < n && isIdentifierStartCode(s.charCodeAt(j))) {
      while (j < n && isIdentifierPartCode(s.charCodeAt(j))) j++;
      return { token: s.slice(i, j), next: j };
    }
    return undefined;
  }

  // Number
  let j = i;
  if (j < n && "+-".includes(s[j])) j++;
  const digitStart = j;
  while (j < n && isDigit(s[j])) j++;
  if (j > digitStart) {
    if (j < n && isIntTypeLead(s[j])) {
      j++;
      while (j < n && isDigit(s[j])) j++;
    }
    return { token: s.slice(i, j), next: j };
  }

  // Identifier or function call
  if (i < n && isIdentifierStartCode(s.charCodeAt(i))) {
    j = i;
    while (j < n && isIdentifierPartCode(s.charCodeAt(j))) j++;
    // Check for function call
    let k = j;
    k = skipWhitespace(s, k);
    if (k < n && s[k] === "(") {
      const close = findMatchingParen(s, k);
      if (close < 0) return undefined;
      return { token: s.slice(i, close + 1), next: close + 1 };
    }
    return { token: s.slice(i, j), next: j };
  }

  return undefined;
}

function skipWhitespace(s: string, i: number): number {
  while (i < s.length && isWhitespace(s[i])) i++;
  return i;
}

function isDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIntTypeLead(ch: string): boolean {
  return "UuIi".includes(ch);
}

// Helper functions (mirrors from shared.ts)

function findMatchingParen(s: string, start: number): number {
  const pairs: { [key: string]: string } = { "(": ")", "{": "}", "[": "]" };
  const open = s[start];
  const close = pairs[open];
  if (!close) return -1;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface TwoCharOp {
  op: string;
  idx: number;
}

function findTopLevelTwoCharOp(s: string, tokens: string[]): TwoCharOp | undefined {
  let depth = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const ch = s[i];
    if ("({[".includes(ch)) {
      depth++;
      continue;
    }
    if (")}]".includes(ch)) {
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    const two = s.slice(i, i + 2);
    if (tokens.includes(two)) return { op: two, idx: i };
  }
  return undefined;
}

interface ComparisonOp {
  op: string;
  idx: number;
}

function findTopLevelComparison(s: string): ComparisonOp | undefined {
  const twoCharOps = ["<=", ">=", "==", "!="];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("({[".includes(ch)) {
      depth++;
      continue;
    }
    if (")}]".includes(ch)) {
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    const two = s.slice(i, i + 2);
    if (twoCharOps.includes(two)) return { op: two, idx: i };
    if ("<>".includes(ch)) return { op: ch, idx: i };
  }
  return undefined;
}

function isIdentifierStartCode(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

function isIdentifierPartCode(c: number): boolean {
  return isIdentifierStartCode(c) || (c >= 48 && c <= 57);
}

function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if (ch === sep && depth === 0) {
      parts.push(s.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function splitNumberAndSuffix(s: string): { numStr: string; rest: string } {
  let i = 0;
  const n = s.length;
  if ("+-".includes(s[i])) i++;
  while (i < n && isDigit(s[i])) i++;
  return { numStr: s.slice(0, i), rest: s.slice(i) };
}
