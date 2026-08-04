import type { Token } from "./tokenizer";

export type Expr =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "null" }
  | { type: "identifier"; name: string }
  | { type: "binary"; operator: string; left: Expr; right: Expr }
  | { type: "unary"; operator: string; operand: Expr }
  | { type: "if"; condition: Expr; then: Stmt; otherwise: Stmt }
  | { type: "while"; condition: Expr; body: Stmt }
  | { type: "match"; value: Expr; arms: MatchArm[] }
  | { type: "call"; callee: Expr; args: Expr[] }
  | { type: "member"; object: Expr; property: string }
  | { type: "object"; properties: [string, Expr][] }
  | { type: "block"; statements: Stmt[] };

export type MatchArm = { pattern: Expr | null; value: Expr };

export type Stmt =
  | { type: "function"; name: string; params: string[]; body: Expr }
  | { type: "let"; name: string; mut: boolean; value: Expr }
  | { type: "assign"; target: Expr; value: Expr }
  | { type: "compoundAssign"; name: string; operator: string; value: Expr }
  | { type: "break" }
  | { type: "continue" }
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
  ["ampersand", "&"],
  ["star", "*"],
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
    if (token.type === "break") {
      index++; // consume "break"
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      return { type: "break" };
    }
    if (token.type === "continue") {
      index++; // consume "continue"
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      return { type: "continue" };
    }
    if (token.type === "fn") {
      index++; // consume "fn"
      const name = tokens[index++]!;
      if (name.type !== "identifier") {
        throw new Error("Expected function name");
      }
      index++; // consume "("
      const params: string[] = [];
      if (current().type !== "rparen") {
        while (true) {
          const param = tokens[index++]!;
          if (param.type !== "identifier") {
            throw new Error("Expected parameter name");
          }
          params.push(param.name);
          if (current().type === "comma") {
            index++;
          } else {
            break;
          }
        }
      }
      index++; // consume ")"
      if (current().type !== "arrow") {
        throw new Error("Expected =>");
      }
      index++; // consume "=>"
      const body = parseExpression();
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      return { type: "function", name: name.name, params, body };
    }
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
      if (expr.type !== "identifier" && !(expr.type === "unary" && expr.operator === "*")) {
        throw new Error("Assignment target must be an identifier or dereference");
      }
      return { type: "assign", target: expr, value };
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
      const token = current();
      if (token.type === "dot") {
        index++; // consume "."
        const prop = tokens[index++]!;
        if (prop.type !== "identifier") {
          throw new Error("Expected property name");
        }
        left = { type: "member", object: left, property: prop.name };
        continue;
      }
      if (token.type === "lparen") {
        index++; // consume "("
        const args: Expr[] = [];
        if (current().type !== "rparen") {
          while (true) {
            args.push(parseExpression());
            if (current().type === "comma") {
              index++;
            } else {
              break;
            }
          }
        }
        index++; // consume ")"
        left = { type: "call", callee: left, args };
        continue;
      }
      const op = binaryOperators.get(token.type);
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
    if (token.type === "ampersand") {
      index++;
      const next = tokens[index];
      if (next?.type === "identifier" && next.name === "mut") {
        index++; // consume "mut"
        return { type: "unary", operator: "&mut", operand: parseUnary() };
      }
      return { type: "unary", operator: "&", operand: parseUnary() };
    }
    const operator = prefixOperators.get(token.type);
    if (operator) {
      index++;
      return { type: "unary", operator, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): Expr {
    const token = tokens[index++]!;
    const parselet = prefixParselets.get(token.type);
    if (!parselet) {
      throw new Error("Unexpected token");
    }
    return parselet(token);
  }

  function parseIf(): Expr {
    const condition = parseParenthesized();
    const then = parseStatement();
    let otherwise: Stmt = { type: "expr", expr: { type: "number", value: 0 } };
    if (current().type === "else") {
      index++; // consume "else"
      otherwise = parseStatement();
    }
    return { type: "if", condition, then, otherwise };
  }

  function parseWhile(): Expr {
    const condition = parseParenthesized();
    const body = parseStatement();
    return { type: "while", condition, body };
  }

  function parseMatch(): Expr {
    const value = parseParenthesized();
    index++; // consume "{"
    const arms: MatchArm[] = [];
    while (current().type !== "rbrace") {
      index++; // consume "case"
      let pattern: Expr | null = null;
      if (current().type === "underscore") {
        index++; // consume "_"
      } else {
        pattern = parseExpression();
      }
      if (current().type !== "arrow") {
        throw new Error("Expected =>");
      }
      index++; // consume "=>"
      const armValue = parseExpression();
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      arms.push({ pattern, value: armValue });
    }
    index++; // consume "}"
    return { type: "match", value, arms };
  }

  function parseNumber(token: Token): Expr {
    return { type: "number", value: (token as { type: "number"; value: number }).value };
  }

  function parseBoolean(token: Token): Expr {
    return { type: "boolean", value: (token as { type: "boolean"; value: boolean }).value };
  }

  function parseNull(): Expr {
    return { type: "null" };
  }

  function parseIdentifier(token: Token): Expr {
    return { type: "identifier", name: (token as { type: "identifier"; name: string }).name };
  }

  function parseGroup(): Expr {
    const expr = parseExpression();
    index++; // consume ")"
    return expr;
  }

  function parseBlockExpr(): Expr {
    const next = tokens[index];
    if (next?.type === "identifier") {
      const after = tokens[index + 1];
      if (after?.type === "colon") {
        return parseObject();
      }
    }
    return parseBlock();
  }

  function parseObject(): Expr {
    const properties: [string, Expr][] = [];
    while (current().type !== "rbrace") {
      const key = tokens[index++]!;
      if (key.type !== "identifier") {
        throw new Error("Expected property name");
      }
      index++; // consume ":"
      const value = parseExpression();
      properties.push([key.name, value]);
      if (current().type === "comma") {
        index++;
      } else {
        break;
      }
    }
    index++; // consume "}"
    return { type: "object", properties };
  }

  function parseParenthesized(): Expr {
    index++; // consume "("
    const expr = parseExpression();
    index++; // consume ")"
    return expr;
  }

  const prefixParselets = new Map<Token["type"], (token: Token) => Expr>([
    ["if", parseIf],
    ["while", parseWhile],
    ["match", parseMatch],
    ["number", parseNumber],
    ["boolean", parseBoolean],
    ["null", parseNull],
    ["identifier", parseIdentifier],
    ["lparen", parseGroup],
    ["lbrace", parseBlockExpr],
  ]);

  function parseProgram(): Program {
    const statements: Stmt[] = [];
    while (index < tokens.length) {
      statements.push(parseStatement());
    }
    return { statements };
  }

  return parseProgram();
}
