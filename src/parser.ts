import type { Token } from "./tokenizer";

export type Expr =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "binary"; operator: string; left: Expr; right: Expr }
  | { type: "unary"; operator: string; operand: Expr }
  | { type: "if"; condition: Expr; then: Expr; otherwise: Expr }
  | { type: "block"; statements: Stmt[] };

export type Stmt =
  | { type: "let"; name: string; mut: boolean; value: Expr }
  | { type: "assign"; name: string; value: Expr }
  | { type: "compoundAssign"; name: string; operator: string; value: Expr }
  | { type: "expr"; expr: Expr };

export type Program = { statements: Stmt[] };

const binaryOperators = new Map<Token["type"], { symbol: string; precedence: number }>([
  ["or", { symbol: "||", precedence: 1 }],
  ["and", { symbol: "&&", precedence: 2 }],
  ["equalsEquals", { symbol: "==", precedence: 3 }],
  ["notEquals", { symbol: "!=", precedence: 3 }],
  ["lessThan", { symbol: "<", precedence: 3 }],
  ["lessThanOrEqual", { symbol: "<=", precedence: 3 }],
  ["greaterThan", { symbol: ">", precedence: 3 }],
  ["greaterThanOrEqual", { symbol: ">=", precedence: 3 }],
  ["plus", { symbol: "+", precedence: 4 }],
  ["minus", { symbol: "-", precedence: 4 }],
  ["star", { symbol: "*", precedence: 5 }],
  ["slash", { symbol: "/", precedence: 5 }],
]);

const prefixOperators = new Map<Token["type"], string>([
  ["not", "!"],
  ["minus", "-"],
]);

const compoundAssignOperators = new Map<Token["type"], string>([
  ["plusEquals", "+"],
  ["minusEquals", "-"],
  ["starEquals", "*"],
  ["slashEquals", "/"],
  ["orEquals", "||"],
  ["andEquals", "&&"],
]);

export function parse(tokens: Token[]): Program {
  let index = 0;

  function current(): Token {
    return tokens[index]!;
  }

  function parseBlock(): Expr {
    const statements: Stmt[] = [];
    while (index < tokens.length && current().type !== "rbrace") {
      statements.push(parseStatement());
    }
    index++; // consume "}"
    return { type: "block", statements };
  }

  function parseStatement(): Stmt {
    const token = current();
    if (token.type === "identifier" && token.name === "let") {
      index++; // consume "let"
      let mut = false;
      const next = tokens[index];
      if (next?.type === "identifier" && next.name === "mut") {
        mut = true;
        index++; // consume "mut"
      }
      const name = tokens[index++]!;
      if (name.type !== "identifier") {
        throw new Error("Expected identifier after let");
      }
      index++; // consume "="
      const value = parseExpression();
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      return { type: "let", name: name.name, mut, value };
    }
    const expr = parseExpression();
    if (tokens[index]?.type === "equals") {
      index++; // consume "="
      const value = parseAssignmentValue();
      return { type: "assign", name: requireIdentifier(expr), value };
    }
    const compoundOperator = compoundAssignOperators.get(tokens[index]?.type ?? "semicolon");
    if (compoundOperator) {
      index++; // consume compound assignment operator
      const value = parseAssignmentValue();
      return { type: "compoundAssign", name: requireIdentifier(expr), operator: compoundOperator, value };
    }
    if (tokens[index]?.type === "semicolon") {
      index++;
    }
    return { type: "expr", expr };
  }

  function parseAssignmentValue(): Expr {
    const value = parseExpression();
    if (tokens[index]?.type === "semicolon") {
      index++;
    }
    return value;
  }

  function requireIdentifier(expr: Expr): string {
    if (expr.type !== "identifier") {
      throw new Error("Assignment target must be an identifier");
    }
    return expr.name;
  }

  function parseExpression(minPrecedence = 0): Expr {
    let left = parseUnary();
    while (index < tokens.length) {
      const op = binaryOperators.get(current().type);
      if (!op || op.precedence < minPrecedence) {
        break;
      }
      index++;
      const right = parseExpression(op.precedence + 1);
      left = { type: "binary", operator: op.symbol, left, right };
    }
    return left;
  }

  function parseUnary(): Expr {
    const token = current();
    const operator = prefixOperators.get(token.type);
    if (operator) {
      index++;
      return { type: "unary", operator, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): Expr {
    const token = tokens[index++]!;
    if (token.type === "if") {
      index++; // consume "("
      const condition = parseExpression();
      index++; // consume ")"
      const then = parseExpression();
      let otherwise: Expr = { type: "number", value: 0 };
      if (current().type === "else") {
        index++; // consume "else"
        otherwise = parseExpression();
      }
      return { type: "if", condition, then, otherwise };
    }
    if (token.type === "number") {
      return { type: "number", value: token.value };
    }
    if (token.type === "boolean") {
      return { type: "boolean", value: token.value };
    }
    if (token.type === "identifier") {
      return { type: "identifier", name: token.name };
    }
    if (token.type === "lparen") {
      const expr = parseExpression();
      index++; // consume ")"
      return expr;
    }
    if (token.type === "lbrace") {
      return parseBlock();
    }
    throw new Error("Unexpected token");
  }

  function parseProgram(): Program {
    const statements: Stmt[] = [];
    while (index < tokens.length) {
      statements.push(parseStatement());
    }
    return { statements };
  }

  return parseProgram();
}
