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
import type { Token } from "./errors";
import { ParseError } from "./errors";
import { validateTypeRange } from "./typechecker";

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
  };
}

function parseParams(p: Parser): FunctionParam[] {
  const params: FunctionParam[] = [];
  const seenNames = new Set<string>();
  while (p.pos < p.tokens.length && !at(p, ")")) {
    const name = curText(p);
    p.pos++; // param name
    if (seenNames.has(name)) {
      throw new ParseError(`duplicate parameter: ${name}`);
    }
    seenNames.add(name);
    const typeAnn = parseTypeToken(p);
    params.push({ name, typeAnnotation: typeAnn });
    if (at(p, ",")) p.pos++;
  }
  return params;
}

function parseTypeToken(p: Parser): string | null {
  if (at(p, ":")) {
    p.pos++; // skip ':'
    const typeToken = curText(p);
    if (typeToken === "&") {
      p.pos++; // skip '&'
      const mutable = at(p, "mut");
      if (mutable) p.pos++; // skip 'mut'
      const innerType = curText(p);
      p.pos++; // skip inner type
      return mutable ? `&mut ${innerType}` : `&${innerType}`;
    }
    p.pos++; // skip type
    return typeToken;
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
  p.pos++; // 'struct'
  const name = curText(p);
  p.pos++; // name
  p.pos++; // '{'
  const fields = parseStructFields(p);
  if (at(p, "}")) p.pos++;
  return { type: "StructDefStatement", name, fields };
}

function parseStructFields(p: Parser): StructField[] {
  const fields: StructField[] = [];
  const seen = new Set<string>();
  while (p.pos < p.tokens.length && !at(p, "}")) {
    const name = curText(p);
    p.pos++; // field name
    if (seen.has(name)) {
      throw new ParseError(`duplicate struct field: ${name}`);
    }
    seen.add(name);
    const typeAnn = parseTypeToken(p);
    fields.push({ name, typeAnnotation: typeAnn });
    if (at(p, ",")) p.pos++;
  }
  return fields;
}

function parseStructLiteral(p: Parser, structName?: string): StructLiteral {
  const name = structName ?? curText(p);
  if (!structName) p.pos++; // struct name
  p.pos++; // '{'
  const fields: { name: string; value: Expr }[] = [];
  while (p.pos < p.tokens.length && !at(p, "}")) {
    const fieldName = curText(p);
    p.pos++; // field name
    p.pos++; // ':'
    const value = parseOrExpression(p);
    fields.push({ name: fieldName, value });
    if (at(p, ",")) p.pos++;
  }
  if (at(p, "}")) p.pos++;
  return { type: "StructLiteral", structName: name, fields };
}

function parseReturnAnnotation(p: Parser): string | null {
  return parseTypeToken(p);
}

function parseLet(p: Parser): LetStatement {
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
  };
}

function parseTypeAnnotation(p: Parser): string | null {
  return parseTypeToken(p);
}

function parseBlock(p: Parser): BlockStatement {
  p.pos++; // '{'
  const body: Statement[] = [];
  while (p.pos < p.tokens.length && !at(p, "}")) {
    body.push(parseStatement(p));
  }
  if (at(p, "}")) p.pos++;
  return { type: "BlockStatement", body };
}

function parseIf(p: Parser): IfStatement {
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
  return { type: "IfStatement", condition, thenBranch, elseBranch };
}

function parseWhile(p: Parser): WhileStatement {
  p.pos++; // 'while'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (at(p, ")")) p.pos++;
  const body = parseStatement(p);
  return { type: "WhileStatement", condition, body };
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
  const token = curText(p);
  if (token === "*") {
    p.pos++; // '*'
    const target = parseFactor(p);
    p.pos++; // '='
    const value = parseOrExpression(p);
    if (at(p, ";")) p.pos++;
    return { type: "DerefAssignStatement", target, value };
  }
  const name = curText(p);
  p.pos++; // name
  const op = curText(p);
  p.pos++; // operator
  const value = parseOrExpression(p);
  if (at(p, ";")) p.pos++;
  if (op === "+=") {
    return { type: "CompoundAssignStatement", name, op, value };
  }
  return { type: "AssignStatement", name, value };
}

function parseExprStmt(p: Parser): ExprStatement {
  const expr = parseOrExpression(p);
  if (at(p, ";")) p.pos++;
  return { type: "ExprStatement", expression: expr };
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
    p.pos++;
    const right = parseExpression(p, prec);
    left = { type: "BinaryExpr", left, op, right };
  }

  return left;
}

function parseFactor(p: Parser): Expr {
  if (p.pos >= p.tokens.length)
    return { type: "NumberLiteral", value: 0, typeAnnotation: null };
  const token = curText(p);

  if (token === "(") return parseParens(p);
  if (token === "true") {
    p.pos++;
    return { type: "BooleanLiteral", value: true };
  }
  if (token === "false") {
    p.pos++;
    return { type: "BooleanLiteral", value: false };
  }
  if (token === "&") {
    p.pos++;
    const mutable = at(p, "mut");
    if (mutable) p.pos++;
    const operand = parseFactor(p);
    return { type: "RefExpr", operand, mutable };
  }
  if (token === "*") {
    p.pos++;
    const operand = parseFactor(p);
    return { type: "DerefExpr", operand };
  }
  if (/\d/.test(token[0]!)) return parseNumber(p, token);
  if (/[a-zA-Z_]/.test(token)) return parseIdentifierOrCall(p, token);

  // Fallback: plain number
  p.pos++;
  return {
    type: "NumberLiteral",
    value: parseInt(token, 10),
    typeAnnotation: null,
  };
}

function parseParens(p: Parser): Expr {
  p.pos++;
  const expr = parseOrExpression(p);
  if (at(p, ")")) p.pos++;
  return expr;
}

function parseNumber(p: Parser, token: string): Expr {
  const numVal = parseInt(token, 10);
  const typeAnn = readTypeAnnotation(token);
  validateTypeRange(numVal, typeAnn);
  p.pos++;
  return { type: "NumberLiteral", value: numVal, typeAnnotation: typeAnn };
}

function readTypeAnnotation(token: string): string | null {
  const match = token.match(/^(\d+)(U\d+)$/);
  return match ? (match[2] ?? null) : null;
}

function parseIdentifierOrCall(p: Parser, token: string): Expr {
  p.pos++;
  if (at(p, "(")) return parseCall(p, token);
  if (at(p, "{")) return parseStructLiteral(p, token);
  return parseIdentifierWithFields(p, token);
}

function parseCall(p: Parser, name: string): CallExpr {
  p.pos++; // '('
  const args = parseCallArgs(p);
  if (at(p, ")")) p.pos++;
  return { type: "CallExpr", name, arguments: args };
}

function parseIdentifierWithFields(p: Parser, name: string): Expr {
  let expr: Expr = { type: "Identifier", name };
  while (at(p, ".")) {
    p.pos++; // '.'
    const field = curText(p);
    p.pos++; // field name
    expr = { type: "FieldAccess", object: expr, field };
  }
  return expr;
}
