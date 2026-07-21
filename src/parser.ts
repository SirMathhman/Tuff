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
} from "./ast";
import type { Token, Position } from "./errors";
import { ParseError } from "./errors";
import { validateTypeRange } from "./typechecker";
import { parseTypeString } from "./types";
import type { Type } from "./types";

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
    p.pos++; // skip type
    return parseTypeString(typeToken);
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
  const loc = curPos(p);
  p.pos++; // '{'
  const body: Statement[] = [];
  while (p.pos < p.tokens.length && !at(p, "}")) {
    body.push(parseStatement(p));
  }
  if (at(p, "}")) p.pos++;
  return { type: "BlockStatement", body, loc };
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
  const name = curText(p);
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
  if (token === "*") {
    const nextPos = pos + 1;
    if (nextPos >= p.tokens.length) return false;
    const afterIdent = nextPos + 1;
    return (
      /[a-zA-Z_]/.test(p.tokens[nextPos]!.text) &&
      afterIdent < p.tokens.length &&
      p.tokens[afterIdent]!.text === "="
    );
  }
  const nextPos = pos + 1;
  if (isKeyword(token)) return false;
  return (
    /[a-zA-Z_]/.test(token) &&
    nextPos < p.tokens.length &&
    isAssignOp(p.tokens[nextPos]?.text)
  );
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

  if (token === "(") return parseParens(p);
  if (token === "true") {
    const loc = curPos(p);
    p.pos++;
    return { type: "BooleanLiteral", value: true, loc };
  }
  if (token === "false") {
    const loc = curPos(p);
    p.pos++;
    return { type: "BooleanLiteral", value: false, loc };
  }
  if (token === "&") {
    const loc = curPos(p);
    p.pos++;
    const mutable = at(p, "mut");
    if (mutable) p.pos++;
    const operand = parseFactor(p);
    return { type: "RefExpr", operand, mutable, loc };
  }
  if (token === "*") {
    const loc = curPos(p);
    p.pos++;
    const operand = parseFactor(p);
    return { type: "DerefExpr", operand, loc };
  }
  if (/\d/.test(token[0]!)) return parseNumber(p, token);
  if (/[a-zA-Z_]/.test(token)) return parseIdentifierOrCall(p, token);

  // Fallback: plain number
  const loc = curPos(p);
  p.pos++;
  return {
    type: "NumberLiteral",
    value: parseInt(token, 10),
    typeAnnotation: null,
    loc,
  };
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
  const match = token.match(/^(\d+)(U\d+)$/);
  if (match) return parseTypeString(match[2] ?? "");
  return null;
}

function parseIdentifierOrCall(p: Parser, token: string): Expr {
  p.pos++;
  if (at(p, "(")) return parseCall(p, token);
  if (at(p, "{")) return parseStructLiteral(p, token);
  return parseIdentifierWithFields(p, token);
}

function parseCall(p: Parser, name: string): CallExpr {
  const loc = curPos(p);
  p.pos++; // '('
  const args = parseCallArgs(p);
  if (at(p, ")")) p.pos++;
  return { type: "CallExpr", name, arguments: args, loc };
}

function parseIdentifierWithFields(p: Parser, name: string): Expr {
  const loc = curPos(p);
  let expr: Expr = { type: "Identifier", name, loc };
  while (at(p, ".")) {
    const fieldLoc = curPos(p);
    p.pos++; // '.'
    const field = curText(p);
    p.pos++; // field name
    expr = { type: "FieldAccess", object: expr, field, loc: fieldLoc };
  }
  return expr;
}
