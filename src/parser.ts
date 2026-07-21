import type {
  Program,
  Statement,
  Expr,
  FunctionParam,
  StructField,
  CallExpr,
  StructLiteral,
  FunctionDefStatement,
  StructDefStatement,
  LetStatement,
  AssignStatement,
  CompoundAssignStatement,
  DerefAssignStatement,
  BlockStatement,
  IfStatement,
  WhileStatement,
  ExprStatement,
  ArrayLiteral,
  IndexAccess,
  BlockExpr,
} from "./ast";
import type { Token, Position } from "./errors";
import { ParseError } from "./errors";
import { validateTypeRange } from "./typechecker";
import { parseTypeString } from "./types";
import type { Type } from "./types";
import { parseTypeString } from "./types";

interface Parser {
  tokens: Token[];
  pos: number;
}

export function cur(p: Parser): Token | undefined {
  return p.tokens[p.pos];
}

function curText(p: Parser): string {
  return cur(p)?.text ?? "";
}

function curPos(p: Parser): Position {
  return cur(p)?.pos ?? { line: 0, col: 0 };
}

function at(p: Parser, ...texts: string[]): boolean {
  const t = cur(p);
  return texts.includes(t?.text ?? "");
}

export function parse(tokens: Token[]): Program {
  const parser: Parser = { tokens, pos: 0 };
  const body: Statement[] = [];

  while (parser.pos < tokens.length) {
    body.push(parseStatement(parser));
  }

  return { type: "Program", body };
}

function parseStatement(p: Parser): Statement {
  if (p.pos >= p.tokens.length) {
    return {
      type: "ExprStatement",
      expression: { type: "NumberLiteral", value: 0, typeAnnotation: null },
    };
  }

  const token = curText(p);

  if (token === "let") return parseLet(p);
  if (token === "fn") return parseFn(p);
  if (token === "struct") return parseStructDef(p);
  if (token === "{") return parseBlock(p);
  if (token === "if") return parseIf(p);
  if (token === "while") return parseWhile(p);
  if (token === "else") return parseElse(p);
  if (isAssignable(p, p.pos)) return parseAssign(p);
  return parseExprStmt(p);
}

function parseFn(p: Parser): FunctionDefStatement {
  const loc = curPos(p);
  p.pos++; // 'fn'
  const name = curText(p);
  p.pos++; // name
  p.pos++; // '('
  const params = parseParams(p);
  if (at(p, ")")) p.pos++;
  const returnAnn = parseReturnAnnotation(p);
  p.pos++; // '=>'
  const body = parseOrExpression(p);
  if (at(p, ";")) p.pos++;
  return {
    type: "FunctionDefStatement",
    name,
    params,
    body,
    returnAnnotation: returnAnn,
    loc,
  };
}

function parseParams(p: Parser): FunctionParam[] {
  const params: FunctionParam[] = [];
  const seenNames = new Set<string>();
  while (p.pos < p.tokens.length && !at(p, ")")) {
    const loc = curPos(p);
    const name = curText(p);
    p.pos++; // param name
    if (seenNames.has(name)) {
      throw new ParseError(`duplicate parameter: ${name}`, loc);
    }
    seenNames.add(name);
    const typeAnn = parseTypeToken(p);
    params.push({ name, typeAnnotation: typeAnn });
    if (at(p, ",")) p.pos++;
  }
  return params;
}

function parseTypeToken(p: Parser): Type | null {
  if (at(p, ":")) {
    p.pos++; // skip ':'
    const typeToken = curText(p);
    if (typeToken === "&") {
      p.pos++; // skip '&'
      const mutable = at(p, "mut");
      if (mutable) p.pos++; // skip 'mut'
      const innerType = curText(p);
      p.pos++; // skip inner type
      const typeStr = mutable ? `&mut ${innerType}` : `&${innerType}`;
      return parseTypeString(typeStr);
    }
    // Array type: [Type; N]
    if (typeToken === "[") {
      return parseArrayType(p);
    }
    // Closure type: (T1, T2) => T3
    if (typeToken === "(") {
      return parseClosureType(p);
    }
    p.pos++; // skip type
    return parseTypeString(typeToken);
  }
  return null;
}

function parseClosureType(p: Parser): Type | null {
  p.pos++; // skip '('
  const paramTypes: Type[] = [];
  while (!at(p, ")") && p.pos < p.tokens.length) {
    const paramType = parseTypeToken(p);
    if (paramType) paramTypes.push(paramType);
    if (at(p, ",")) p.pos++;
  }
  if (!at(p, ")")) return null;
  p.pos++; // skip ')'
  if (!at(p, "=>")) return null;
  p.pos++; // skip '=>'
  const returnType = parseTypeToken(p);
  if (!returnType) return null;
  return { kind: "closure", paramTypes, returnType };
}

function parseArrayType(p: Parser): Type | null {
  const typeToken = curText(p);
  if (typeToken === "[") {
    p.pos++; // skip '['
    const innerType = curText(p);
    p.pos++; // skip inner type
    if (at(p, ";")) p.pos++; // skip ';'
    const sizeToken = curText(p);
    p.pos++; // skip size
    if (at(p, "]")) p.pos++; // skip ']'
    return parseTypeString(`[${innerType}; ${sizeToken}]`);
  }
  return null;
}

function parseCallArgs(p: Parser): Expr[] {
  const args: Expr[] = [];
  while (p.pos < p.tokens.length && !at(p, ")")) {
    args.push(parseOrExpression(p));
    if (at(p, ",")) p.pos++;
  }
  return args;
}

function parseStructDef(p: Parser): StructDefStatement {
  const loc = curPos(p);
  p.pos++; // 'struct'
  const name = curText(p);
  p.pos++; // name
  p.pos++; // '{'
  const fields = parseStructFields(p);
  if (at(p, "}")) p.pos++;
  return { type: "StructDefStatement", name, fields, loc };
}

function parseStructFields(p: Parser): StructField[] {
  const fields: StructField[] = [];
  const seen = new Set<string>();
  while (p.pos < p.tokens.length && !at(p, "}")) {
    const loc = curPos(p);
    const name = curText(p);
    p.pos++; // field name
    if (seen.has(name)) {
      throw new ParseError(`duplicate struct field: ${name}`, loc);
    }
    seen.add(name);
    const typeAnn = parseTypeToken(p);
    fields.push({ name, typeAnnotation: typeAnn, loc });
    if (at(p, ",")) p.pos++;
  }
  return fields;
}

function parseStructLiteral(p: Parser, structName?: string): StructLiteral {
  const loc = curPos(p);
  const name = structName ?? curText(p);
  if (!structName) p.pos++; // struct name
  p.pos++; // '{'
  const fields: { name: string; value: Expr; loc?: Position }[] = [];
  while (p.pos < p.tokens.length && !at(p, "}")) {
    const fieldLoc = curPos(p);
    const fieldName = curText(p);
    p.pos++; // field name
    p.pos++; // ':'
    const value = parseOrExpression(p);
    fields.push({ name: fieldName, value, loc: fieldLoc });
    if (at(p, ",")) p.pos++;
  }
  if (at(p, "}")) p.pos++;
  return { type: "StructLiteral", structName: name, fields, loc };
}

function parseReturnAnnotation(p: Parser): string | null {
  return parseTypeToken(p);
}

function parseLet(p: Parser): LetStatement {
  const loc = curPos(p);
  p.pos++; // 'let'
  const mutable = at(p, "mut");
  if (mutable) p.pos++;
  const name = curText(p);
  p.pos++; // name
  const typeAnn = parseTypeAnnotation(p);
  p.pos++; // '='
  const value = parseOrExpression(p);
  if (at(p, ";")) p.pos++;
  return {
    type: "LetStatement",
    mutable,
    name,
    typeAnnotation: typeAnn,
    value,
    loc,
  };
}

function parseTypeAnnotation(p: Parser): Type | null {
  return parseTypeToken(p);
}

function parseBlock(p: Parser): BlockStatement {
  const { body, loc } = parseBracedBlock(p);
  return { type: "BlockStatement", body, loc };
}

function parseBracedBlock(p: Parser): { body: Statement[]; loc: Position } {
  const loc = curPos(p);
  p.pos++; // '{'
  const body: Statement[] = [];
  while (p.pos < p.tokens.length && !at(p, "}")) {
    body.push(parseStatement(p));
  }
  if (at(p, "}")) p.pos++;
  return { body, loc };
}

function parseIf(p: Parser): IfStatement {
  const loc = curPos(p);
  p.pos++; // 'if'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (at(p, ")")) p.pos++;
  const thenBranch = parseStatement(p);
  let elseBranch: Statement | null = null;
  if (at(p, "else")) {
    p.pos++;
    elseBranch = parseStatement(p);
  }
  return { type: "IfStatement", condition, thenBranch, elseBranch, loc };
}

function parseWhile(p: Parser): WhileStatement {
  const loc = curPos(p);
  p.pos++; // 'while'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (at(p, ")")) p.pos++;
  const body = parseStatement(p);
  return { type: "WhileStatement", condition, body, loc };
}

function parseElse(p: Parser): ExprStatement {
  p.pos++;
  return {
    type: "ExprStatement",
    expression: { type: "NumberLiteral", value: 0, typeAnnotation: null },
  };
}

function parseAssign(
  p: Parser,
): AssignStatement | CompoundAssignStatement | DerefAssignStatement {
  const loc = curPos(p);
  const token = curText(p);
  if (token === "*") {
    p.pos++; // '*'
    const target = parseFactor(p);
    p.pos++; // '='
    const value = parseOrExpression(p);
    if (at(p, ";")) p.pos++;
    return { type: "DerefAssignStatement", target, value, loc };
  }
  // Check for array index assignment: arr[i] = ...
  const name = curText(p);
  const nextToken = p.tokens[p.pos + 1]?.text;
  if (/[a-zA-Z_]/.test(name) && nextToken === "[") {
    p.pos++; // name
    const indexLoc = curPos(p);
    p.pos++; // '['
    const index = parseOrExpression(p);
    if (at(p, "]")) p.pos++; // ']'
    p.pos++; // '='
    const value = parseOrExpression(p);
    if (at(p, ";")) p.pos++;
    const target: IndexAccess = {
      type: "IndexAccess",
      object: { type: "Identifier", name, loc },
      index,
      loc: indexLoc,
    };
    return { type: "DerefAssignStatement", target, value, loc };
  }
  p.pos++; // name
  const op = curText(p);
  p.pos++; // operator
  const value = parseOrExpression(p);
  if (at(p, ";")) p.pos++;
  if (op === "+=") {
    return { type: "CompoundAssignStatement", name, op, value, loc };
  }
  return { type: "AssignStatement", name, value, loc };
}

function parseExprStmt(p: Parser): ExprStatement {
  const loc = curPos(p);
  const expr = parseOrExpression(p);
  if (at(p, ";")) p.pos++;
  return { type: "ExprStatement", expression: expr, loc };
}

function isAssignable(p: Parser, pos: number): boolean {
  if (pos >= p.tokens.length) return false;
  const token = p.tokens[pos]!.text;
  if (token === "*") return isDerefAssign(p, pos);
  const nextPos = pos + 1;
  if (isKeyword(token)) return false;
  if (isIdentToken(token)) return isIdentAssign(p, nextPos);
  return false;
}

function isDerefAssign(p: Parser, pos: number): boolean {
  const nextPos = pos + 1;
  if (nextPos >= p.tokens.length) return false;
  const afterIdent = nextPos + 1;
  return (
    isIdentToken(p.tokens[nextPos]!.text) &&
    afterIdent < p.tokens.length &&
    p.tokens[afterIdent]!.text === "="
  );
}

function isIdentAssign(p: Parser, nextPos: number): boolean {
  if (nextPos >= p.tokens.length) return false;
  const nextToken = p.tokens[nextPos]!.text;
  if (nextToken === "[") return isArrayIndexAssign(p, nextPos);
  return isAssignOp(nextToken);
}

function isArrayIndexAssign(p: Parser, bracketPos: number): boolean {
  const closePos = findClosingBracket(p, bracketPos);
  return isAssignOp(p.tokens[closePos]?.text);
}

function findClosingBracket(p: Parser, bracketPos: number): number {
  let bracketDepth = 1;
  let scanPos = bracketPos + 1;
  while (scanPos < p.tokens.length && bracketDepth > 0) {
    if (p.tokens[scanPos]?.text === "[") bracketDepth++;
    if (p.tokens[scanPos]?.text === "]") bracketDepth--;
    scanPos++;
  }
  return scanPos;
}

function isKeyword(token: string): boolean {
  return (
    token === "let" ||
    token === "mut" ||
    token === "true" ||
    token === "false" ||
    token === "if" ||
    token === "else" ||
    token === "while" ||
    token === "fn" ||
    token === "struct"
  );
}

function isAssignOp(token: string | undefined): boolean {
  return token === "=" || token === "+=";
}

// ── Expression Parser (precedence climbing) ────────────────────────────────

const precedence: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "==": 3,
  "!=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
};

export function parseOrExpression(p: Parser): Expr {
  return parseExpression(p, 0);
}

function parseExpression(p: Parser, minPrec: number): Expr {
  let left = parseFactor(p);

  while (p.pos < p.tokens.length) {
    const op = curText(p);
    const prec = precedence[op];
    if (prec === undefined || prec <= minPrec) break;
    const loc = curPos(p);
    p.pos++;
    const right = parseExpression(p, prec);
    left = { type: "BinaryExpr", left, op, right, loc };
  }

  return left;
}

function parseFactor(p: Parser): Expr {
  if (p.pos >= p.tokens.length)
    return { type: "NumberLiteral", value: 0, typeAnnotation: null };
  const token = curText(p);

  if (isParenOrBlock(token)) return parseParenOrBlock(p, token);
  if (isBooleanToken(token)) return parseBoolean(p, token);
  if (isOperatorToken(token)) return parseOperatorFactor(p, token);
  if (isNumericToken(token)) return parseNumber(p, token);
  if (isIdentToken(token)) return parseIdentifierOrCall(p, token);
  return parseFallback(p, token);
}

function isBooleanToken(token: string): boolean {
  return token === "true" || token === "false";
}

function parseBoolean(p: Parser, token: string): Expr {
  const loc = curPos(p);
  p.pos++;
  return { type: "BooleanLiteral", value: token === "true", loc };
}

function isParenOrBlock(token: string): boolean {
  return token === "(" || token === "{" || token === "[";
}

function parseParenOrBlock(p: Parser, token: string): Expr {
  if (token === "(") return tryParseClosureOrParens(p);
  if (token === "{") return parseBlockExpr(p);
  return parseArrayLiteral(p);
}

function isOperatorToken(token: string): boolean {
  return token === "&" || token === "*" || token === "-";
}

function parseOperatorFactor(p: Parser, token: string): Expr {
  if (token === "&") return parseRefExpr(p);
  if (token === "*") return parseDerefExpr(p);
  return parseUnaryMinus(p);
}

function parseBlockExpr(p: Parser): BlockExpr {
  const { body, loc } = parseBracedBlock(p);
  return { type: "BlockExpr", body, loc };
}

function isNumericToken(token: string): boolean {
  return /\d/.test(token[0]!);
}

function isIdentToken(token: string): boolean {
  return /[a-zA-Z_]/.test(token);
}

function parseFallback(p: Parser, token: string): Expr {
  const loc = curPos(p);
  p.pos++;
  return {
    type: "NumberLiteral",
    value: parseInt(token, 10),
    typeAnnotation: null,
    loc,
  };
}

function parseRefExpr(p: Parser): Expr {
  const loc = curPos(p);
  p.pos++;
  const mutable = at(p, "mut");
  if (mutable) p.pos++;
  const operand = parseFactor(p);
  return { type: "RefExpr", operand, mutable, loc };
}

function parseDerefExpr(p: Parser): Expr {
  const loc = curPos(p);
  p.pos++;
  const operand = parseFactor(p);
  return { type: "DerefExpr", operand, loc };
}

function parseUnaryMinus(p: Parser): Expr {
  const loc = curPos(p);
  p.pos++;
  const operand = parseFactor(p);
  return { type: "UnaryExpr", op: "-", operand, loc };
}

function tryParseClosureOrParens(p: Parser): Expr {
  const savedPos = p.pos;
  const loc = curPos(p);
  p.pos++; // skip '('

  // Check for capture declaration
  const captureResult = tryParseCapture(p);
  if (captureResult === null) {
    p.pos = savedPos;
    return parseParens(p);
  }
  const captureMode = captureResult;

  // Parse parameters
  const params = parseClosureParams(p, savedPos);
  if (params === null) return parseParens(p);

  const body = parseOrExpression(p);
  return { type: "ClosureExpr", captureMode, params, body, loc };
}

function tryParseCapture(p: Parser): "ref" | "mut" | "move" | null {
  if (!at(p, "&")) return "ref";
  p.pos++; // skip '&'
  let mode: "ref" | "mut" | "move" = "ref";
  if (at(p, "mut")) {
    mode = "mut";
    p.pos++;
  } else if (at(p, "move")) {
    mode = "move";
    p.pos++;
  }
  if (!at(p, "this")) return null;
  p.pos++; // skip 'this'
  if (at(p, ",")) p.pos++;
  return mode;
}

function parseClosureParams(
  p: Parser,
  savedPos: number,
): FunctionParam[] | null {
  const params: FunctionParam[] = [];
  while (!at(p, ")") && p.pos < p.tokens.length) {
    const paramLoc = curPos(p);
    const paramName = curText(p);
    p.pos++; // param name
    const typeAnn = parseTypeToken(p);
    params.push({ name: paramName, typeAnnotation: typeAnn, loc: paramLoc });
    if (at(p, ",")) p.pos++;
  }
  if (!at(p, ")")) {
    p.pos = savedPos;
    return null;
  }
  p.pos++; // skip ')'
  if (!at(p, "=>")) {
    p.pos = savedPos;
    return null;
  }
  p.pos++; // skip '=>'
  return params;
}

function parseParens(p: Parser): Expr {
  p.pos++;
  const expr = parseOrExpression(p);
  if (at(p, ")")) p.pos++;
  return expr;
}

function parseNumber(p: Parser, token: string): Expr {
  const loc = curPos(p);
  const numVal = parseInt(token, 10);
  const typeAnn = readTypeAnnotation(token);
  validateTypeRange(numVal, typeAnn, loc);
  p.pos++;
  return { type: "NumberLiteral", value: numVal, typeAnnotation: typeAnn, loc };
}

function readTypeAnnotation(token: string): Type | null {
  const match = token.match(/^(\d+)([UI]\d+)$/);
  if (match) return parseTypeString(match[2] ?? "");
  return null;
}

function parseIdentifierOrCall(p: Parser, token: string): Expr {
  p.pos++;
  if (at(p, "(")) return parseCall(p, token);
  if (at(p, "{")) return parseStructLiteral(p, token);
  return parseIdentifierWithChaining(p, token);
}

function parseCall(p: Parser, name: string): CallExpr {
  const loc = curPos(p);
  p.pos++; // '('
  const args = parseCallArgs(p);
  if (at(p, ")")) p.pos++;
  return { type: "CallExpr", name, arguments: args, loc };
}

function parseIdentifierWithChaining(p: Parser, name: string): Expr {
  const loc = curPos(p);
  let expr: Expr = { type: "Identifier", name, loc };
  while (at(p, ".") || at(p, "[")) {
    if (at(p, ".")) {
      const fieldLoc = curPos(p);
      p.pos++; // '.'
      const field = curText(p);
      p.pos++; // field name
      if (field === "length") {
        expr = { type: "LengthAccess", object: expr, loc: fieldLoc };
      } else {
        expr = { type: "FieldAccess", object: expr, field, loc: fieldLoc };
      }
    } else if (at(p, "[")) {
      const indexLoc = curPos(p);
      p.pos++; // '['
      const index = parseOrExpression(p);
      if (at(p, "]")) p.pos++; // ']'
      expr = { type: "IndexAccess", object: expr, index, loc: indexLoc };
    }
  }
  return expr;
}

function parseArrayLiteral(p: Parser): ArrayLiteral {
  const loc = curPos(p);
  p.pos++; // '['
  const elements: Expr[] = [];
  while (p.pos < p.tokens.length && !at(p, "]")) {
    elements.push(parseOrExpression(p));
    if (at(p, ",")) p.pos++;
  }
  if (at(p, "]")) p.pos++;
  return { type: "ArrayLiteral", elements, loc };
}
