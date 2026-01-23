import { type CompileError } from "./types/types";

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<X>(error: X): { ok: false; error: X } {
  return { ok: false, error };
}

export function createCompileError(
  cause: string,
  reason: string,
  fix: string,
  length: number,
): CompileError {
  return {
    cause,
    reason,
    fix,
    first: { line: 1, column: 1, length },
  };
}

function createBounds(
  minVal: number,
  maxVal: number,
): { minVal: number; maxVal: number } {
  return { minVal, maxVal };
}

const SIGNED_SHIFTS = [63, 31, 15, 7];
const UNSIGNED_SHIFTS = [64, 32, 16, 8];

export function getSuffixInfo(
  source: string,
): { suffix: string; minVal: number; maxVal: number } | undefined {
  const signedTypes = ["I64", "I32", "I16", "I8"];
  const unsignedTypes = ["U64", "U32", "U16", "U8"];

  for (let i = 0; i < signedTypes.length; i++) {
    if (source.endsWith(signedTypes[i])) {
      const bits = SIGNED_SHIFTS[i];
      return {
        suffix: signedTypes[i],
        ...createBounds(-(2 ** bits), 2 ** bits - 1),
      };
    }
  }

  for (let i = 0; i < unsignedTypes.length; i++) {
    if (source.endsWith(unsignedTypes[i])) {
      const bits = UNSIGNED_SHIFTS[i];
      return {
        suffix: unsignedTypes[i],
        ...createBounds(0, 2 ** bits - 1),
      };
    }
  }

  return undefined;
}

export type Expression =
  | { type: "literal"; value: number }
  | { type: "read"; typeStr: string }
  | { type: "variable"; name: string }
  | {
      type: "binary";
      op: "+" | "-" | "*" | "/";
      left: Expression;
      right: Expression;
    }
  | {
      type: "assignment";
      name: string;
      value: Expression;
    }
  | {
      type: "block";
      statements: Array<{
        name: string;
        typeStr: string;
        mutable: boolean;
        value: Expression;
      }>;
      result: Expression;
    };

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<X> {
  ok: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

function parseNumericLiteral(source: string): Result<number, CompileError> {
  const suffixInfo = getSuffixInfo(source);
  const numStr = suffixInfo
    ? source.slice(0, -suffixInfo.suffix.length)
    : source;
  const value = parseInt(numStr, 10);

  if (isNaN(value)) {
    const cause = suffixInfo
      ? `Invalid ${suffixInfo.suffix} literal`
      : "Invalid input";
    const reason = suffixInfo
      ? `${suffixInfo.suffix} suffix requires a valid integer before it`
      : "Input must be a valid integer or empty";
    const fix = suffixInfo
      ? `Use format like '100${suffixInfo.suffix}'`
      : "Provide a valid integer like '100' or leave empty";
    return err(createCompileError(cause, reason, fix, source.length));
  }

  if (suffixInfo && (value < suffixInfo.minVal || value > suffixInfo.maxVal)) {
    return err(
      createCompileError(
        `Invalid ${suffixInfo.suffix} literal`,
        `${suffixInfo.suffix} literals must be in range ${suffixInfo.minVal}-${suffixInfo.maxVal}, got ${value}`,
        `Use a value between ${suffixInfo.minVal} and ${suffixInfo.maxVal} for ${suffixInfo.suffix} suffix`,
        source.length,
      ),
    );
  }

  return ok(value);
}

function isCharInRange(code: number, ranges: Array<[number, number]>): boolean {
  for (const [min, max] of ranges) {
    if (code >= min && code <= max) return true;
  }
  return false;
}

function isValidIdentifier(source: string): boolean {
  if (source.length === 0) return false;

  const letterRanges: Array<[number, number]> = [
    [65, 90], // A-Z
    [97, 122], // a-z
  ];
  const identifierRanges: Array<[number, number]> = [
    [48, 57], // 0-9
    [65, 90], // A-Z
    [97, 122], // a-z
  ];

  const first = source.charCodeAt(0);
  const isFirstValid = isCharInRange(first, letterRanges) || first === 95; // _ = 95

  if (!isFirstValid) return false;

  for (let i = 1; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (!isCharInRange(code, identifierRanges) && code !== 95) {
      return false;
    }
  }

  return true;
}

function findSemicolonAtDepth0WithConstraint(
  source: string,
  mustFindEqualsFirst: boolean = false,
): number {
  let depth = 0;
  let foundConstraint = !mustFindEqualsFirst;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "(" || char === "{") depth++;
    else if (char === ")" || char === "}") depth--;
    else if (char === "=" && depth === 0) foundConstraint = true;
    else if (depth === 0 && char === ";" && foundConstraint) return i;
  }
  return -1;
}

function findSemicolonAtDepth0(source: string): number {
  return findSemicolonAtDepth0WithConstraint(source, false);
}

function createLetError(
  message: string,
  fix: string,
  length: number,
): Err<CompileError> {
  return err(createCompileError("Invalid let statement", message, fix, length));
}

function parseMutKeyword(input: string): { mutable: boolean; rest: string } {
  if (input.startsWith("mut ")) {
    return { mutable: true, rest: input.slice(4).trim() };
  }
  return { mutable: false, rest: input };
}

function parseLetStatement(
  statement: string,
): Result<
  { name: string; typeStr: string; mutable: boolean; expr: string },
  CompileError
> {
  const eqIndex = statement.lastIndexOf("=");
  if (eqIndex === -1) {
    return createLetError(
      "let statement must have assignment",
      'Use format: "let name : Type = expr;" or "let name = expr;"',
      statement.length,
    );
  }

  const nameAndType = statement.slice(0, eqIndex).trim();
  const expr = statement.slice(eqIndex + 1).trim();

  // Check for 'mut' keyword
  const { mutable, rest: nameAndTypeForParsing } = parseMutKeyword(nameAndType);

  const colonIndex = nameAndTypeForParsing.indexOf(":");
  if (colonIndex === -1) {
    // No type annotation - use the entire nameAndTypeForParsing as the name
    const name = nameAndTypeForParsing.trim();
    return ok({ name, typeStr: "", mutable, expr });
  }

  const name = nameAndTypeForParsing.slice(0, colonIndex).trim();
  const typeStr = nameAndTypeForParsing.slice(colonIndex + 1).trim();

  return ok({ name, typeStr, mutable, expr });
}

function parseBlockExpression(
  source: string,
): Result<Expression, CompileError> {
  const inner = source.slice(1, -1).trim();
  const statements: Array<{
    name: string;
    typeStr: string;
    mutable: boolean;
    value: Expression;
  }> = [];
  let remaining = inner;

  while (remaining.startsWith("let ")) {
    const semiIndex = findSemicolonAtDepth0(remaining);
    if (semiIndex === -1) {
      return createLetError(
        "let statement must end with semicolon",
        'Use format: "let varname : Type = expr;"',
        remaining.length,
      );
    }

    const statement = remaining.slice(4, semiIndex).trim();
    remaining = remaining.slice(semiIndex + 1).trim();

    const letResult = parseLetStatement(statement);
    if (!letResult.ok) return letResult;

    const exprResult = parseExpression(letResult.value.expr);
    if (!exprResult.ok) return exprResult;

    statements.push({
      name: letResult.value.name,
      typeStr: letResult.value.typeStr,
      mutable: letResult.value.mutable,
      value: exprResult.value,
    });
  }

  const resultExpr = parseExpression(remaining);
  if (!resultExpr.ok) return resultExpr;

  if (statements.length === 0) {
    return ok(resultExpr.value);
  }

  return ok({
    type: "block",
    statements,
    result: resultExpr.value,
  });
}

function checkBracketPairing(
  source: string,
  openChar: string,
  closeChar: string,
): boolean {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === openChar) depth++;
    if (source[i] === closeChar) depth--;
    if (depth === 0 && i < source.length - 1) {
      return false;
    }
  }
  return depth === 0;
}

function isFullyWrappedInBrackets(
  source: string,
): { type: "paren" | "brace" } | undefined {
  const bracketPairs: Array<{
    open: string;
    close: string;
    type: "paren" | "brace";
  }> = [
    { open: "(", close: ")", type: "paren" },
    { open: "{", close: "}", type: "brace" },
  ];

  for (const pair of bracketPairs) {
    const isWrapped =
      source.startsWith(pair.open) &&
      source.endsWith(pair.close) &&
      checkBracketPairing(source, pair.open, pair.close);
    if (isWrapped) {
      return { type: pair.type };
    }
  }

  return undefined;
}

function parsePrimary(source: string): Result<Expression, CompileError> {
  const bracketInfo = isFullyWrappedInBrackets(source);
  if (bracketInfo) {
    const inner = source.slice(1, -1).trim();
    if (inner.startsWith("let ")) {
      return parseBlockExpression(source);
    }
    return parseExpression(inner);
  }

  if (source.startsWith("read ")) {
    const typeStr = source.slice(5).trim();
    const suffixInfo = getSuffixInfo(typeStr);

    if (suffixInfo === undefined) {
      return err(
        createCompileError(
          "Invalid read type",
          `Unknown integer type: ${typeStr}`,
          "Use format like 'read U8', 'read I32', etc.",
          source.length,
        ),
      );
    }

    return ok({ type: "read", typeStr });
  }

  const numResult = parseNumericLiteral(source);
  if (numResult.ok) {
    return ok({ type: "literal", value: numResult.value });
  }

  if (isValidIdentifier(source)) {
    return ok({ type: "variable", name: source });
  }

  return numResult;
}

type BinaryOp = "+" | "-" | "*" | "/";
type ParserFunction = (source: string) => Result<Expression, CompileError>;

function parseBinaryExpression(
  source: string,
  operators: BinaryOp[],
  nextParser: ParserFunction,
): Result<Expression, CompileError> {
  let operatorIndex = -1;
  let operator: BinaryOp | undefined;
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = source.length - 1; i >= 0; i--) {
    const char = source[i];

    if (char === ")") {
      parenDepth++;
    } else if (char === "(") {
      parenDepth--;
    } else if (char === "}") {
      braceDepth++;
    } else if (char === "{") {
      braceDepth--;
    } else if (
      parenDepth === 0 &&
      braceDepth === 0 &&
      operators.includes(char as BinaryOp)
    ) {
      operatorIndex = i;
      operator = char as BinaryOp;
      break;
    }
  }

  if (operatorIndex > 0 && operator) {
    const left = source.slice(0, operatorIndex).trim();
    const right = source.slice(operatorIndex + 1).trim();

    const leftResult = parseBinaryExpression(left, operators, nextParser);
    const rightResult = nextParser(right);

    if (!leftResult.ok) return leftResult;
    if (!rightResult.ok) return rightResult;

    return ok({
      type: "binary",
      op: operator,
      left: leftResult.value,
      right: rightResult.value,
    });
  }

  return nextParser(source);
}

function parseAdditionSubtraction(
  source: string,
): Result<Expression, CompileError> {
  return parseBinaryExpression(source, ["+", "-"], parseMultiplicationDivision);
}

function parseMultiplicationDivision(
  source: string,
): Result<Expression, CompileError> {
  return parseBinaryExpression(source, ["*", "/"], parsePrimary);
}
function findTopLevelSemicolonAfterEquals(source: string): number {
  return findSemicolonAtDepth0WithConstraint(source, true);
}

function parseTopLevelLet(source: string): Result<Expression, CompileError> {
  const eqIndex = source.indexOf("=");
  if (eqIndex === -1)
    return createLetError(
      "Missing = in let binding",
      "Add = between name and value",
      source.length,
    );

  const semiIndex = findTopLevelSemicolonAfterEquals(source);
  if (semiIndex === -1)
    return createLetError(
      "Missing ; after let binding value",
      "Add ; to complete let binding",
      source.length,
    );

  let letPart = source.slice(4, eqIndex).trim();
  const { mutable, rest: letPartAfterMut } = parseMutKeyword(letPart);
  letPart = letPartAfterMut;

  const colonIndex = letPart.indexOf(":");
  let name: string;
  let typeStr: string;

  if (colonIndex === -1) {
    // No type annotation - entire letPart is the name
    name = letPart;
    typeStr = "";
  } else {
    // Type annotation present
    name = letPart.slice(0, colonIndex).trim();
    typeStr = letPart.slice(colonIndex + 1).trim();
  }

  const expr = source.slice(eqIndex + 1, semiIndex).trim();
  const resultPart = source.slice(semiIndex + 1).trim();

  const valueResult = parseExpression(expr);
  if (!valueResult.ok) return valueResult;

  const resultExpr = parseExpression(resultPart);
  if (!resultExpr.ok) return resultExpr;

  return ok({
    type: "block",
    statements: [{ name, typeStr, mutable, value: valueResult.value }],
    result: resultExpr.value,
  });
}

function isInCharRange(
  char: string,
  minLower: string,
  maxLower: string,
  minUpper: string,
  maxUpper: string,
): boolean {
  return (
    (char >= minLower && char <= maxLower) ||
    (char >= minUpper && char <= maxUpper)
  );
}

function isValidIdentifierStart(char: string | undefined): boolean {
  if (!char) return false;
  return isInCharRange(char, "a", "z", "A", "Z") || char === "_";
}

function isValidIdentifierChar(char: string | undefined): boolean {
  if (!char) return false;
  return (
    isInCharRange(char, "a", "z", "A", "Z") ||
    (char >= "0" && char <= "9") ||
    char === "_"
  );
}

function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length && source[i] === " ") {
    i++;
  }
  return i;
}

function tryParseAssignment(source: string): {
  isAssignment: boolean;
  name?: string;
  valueStr?: string;
} {
  let i = 0;

  // Parse identifier
  if (!isValidIdentifierStart(source[i])) {
    return { isAssignment: false };
  }

  const nameStart = i;
  while (i < source.length && isValidIdentifierChar(source[i])) {
    i++;
  }

  const name = source.slice(nameStart, i);

  // Skip whitespace
  i = skipWhitespace(source, i);

  // Check for =
  if (i >= source.length || source[i] !== "=") {
    return { isAssignment: false };
  }

  i++; // skip =

  // Skip whitespace
  i = skipWhitespace(source, i);

  const valueStr = source.slice(i).trim();
  return { isAssignment: true, name, valueStr };
}

export function parseExpression(
  source: string,
): Result<Expression, CompileError> {
  if (source === "") {
    return ok({ type: "literal", value: 0 });
  }

  if (source.startsWith("let ")) {
    return parseTopLevelLet(source);
  }

  // Check for assignment expression: name = value
  const assignment = tryParseAssignment(source);
  if (assignment.isAssignment && assignment.name && assignment.valueStr) {
    const valueResult = parseExpression(assignment.valueStr);
    if (!valueResult.ok) return valueResult;

    return ok({
      type: "assignment",
      name: assignment.name,
      value: valueResult.value,
    });
  }

  return parseAdditionSubtraction(source);
}
