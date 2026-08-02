import type { Token } from "./lexer.ts";
import { array, ref, type Type } from "./types.ts";

// --- AST node types ---

export interface Param {
  name: string;
  type: Type;
}

export interface Program {
  kind: "Program";
  params: Param[];
  body: Stmt[];
}

export type Stmt = VariableDecl | ExprStmt;

export interface VariableDecl {
  kind: "VariableDecl";
  name: string;
  /** Optional explicit type annotation, e.g. `let x : U8 = ...`. */
  type?: Type;
  value: Expr;
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: Expr;
}

export type Expr =
  IdentifierExpr | MemberAccessExpr | NumberLiteral | StringLiteral | UnaryExpr;

export interface IdentifierExpr {
  kind: "Identifier";
  name: string;
}

export interface UnaryExpr {
  kind: "Unary";
  operator: "-";
  operand: Expr;
}

export interface MemberAccessExpr {
  kind: "MemberAccess";
  object: Expr;
  property: string;
}

export interface NumberLiteral {
  kind: "NumberLiteral";
  value: number;
  /** Optional integer suffix, e.g. `U8` in `100U8`. */
  suffix?: string;
}

export interface StringLiteral {
  kind: "StringLiteral";
  value: string;
}

// --- Parser ---

export class ParseError extends Error {}

export function parse(tokens: Token[]): Program {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function advance(): Token {
    const token = tokens[pos];
    if (token === undefined) {
      throw new ParseError("Unexpected end of input");
    }
    pos++;
    return token;
  }

  function expectPunct(value: string): void {
    const token = advance();
    if (token.type !== "punct" || token.value !== value) {
      throw new ParseError(`Expected '${value}' but found '${token.value}'`);
    }
  }

  // Consumes an optional `;` statement terminator.
  function consumeSemicolon(): void {
    const token = peek();
    if (token?.type === "punct" && token.value === ";") {
      advance();
    }
  }

  // Parses a single Tuff type: `&`, `[`, `]`, or a primitive like `Str`/`Num`.
  function parseType(): Type {
    const token = advance();

    switch (token.type) {
      case "punct":
        if (token.value === "&") {
          return ref(parseType());
        }
        if (token.value === "[") {
          const inner = parseType();
          expectPunct("]");
          return array(inner);
        }
        break;
      case "identifier":
        if (token.value === "Str") {
          return { kind: "Str" };
        }
        if (token.value === "Num") {
          return { kind: "Number" };
        }
        if (token.value === "U8") {
          return { kind: "U8" };
        }
        if (token.value === "U16") {
          return { kind: "U16" };
        }
        throw new ParseError(`Unknown type '${token.value}'`);
      default:
        break;
    }

    throw new ParseError(`Expected a type but found '${token.value}'`);
  }

  // Parses the `in` declaration block: `in let args : &[&Str];`.
  function parseDeclarationBlock(): Param[] {
    const params: Param[] = [];

    const inToken = advance();
    if (inToken.type !== "keyword" || inToken.value !== "in") {
      throw new ParseError("Program must start with an 'in' declaration block");
    }

    const letToken = advance();
    if (letToken.type !== "keyword" || letToken.value !== "let") {
      throw new ParseError("Expected 'let' after 'in'");
    }

    const nameToken = advance();
    if (nameToken.type !== "identifier") {
      throw new ParseError("Expected an identifier in declaration");
    }

    expectPunct(":");
    const type = parseType();
    expectPunct(";");

    params.push({ name: nameToken.value, type });
    return params;
  }

  function parseMemberAccess(object: Expr): Expr {
    let expr = object;
    while (peek()?.type === "punct" && peek()?.value === ".") {
      advance(); // '.'
      const prop = advance();
      if (prop.type !== "identifier") {
        throw new ParseError("Expected a property name after '.'");
      }
      expr = { kind: "MemberAccess", object: expr, property: prop.value };
    }
    return expr;
  }

  function parsePrimary(): Expr {
    const token = advance();

    switch (token.type) {
      case "number":
        return {
          kind: "NumberLiteral",
          value: Number(token.value),
          suffix: token.suffix,
        };
      case "string":
        return { kind: "StringLiteral", value: token.value };
      case "identifier":
        return parseMemberAccess({ kind: "Identifier", name: token.value });
      default:
        throw new ParseError(`Unexpected token '${token.value}'`);
    }
  }

  function parseExpression(): Expr {
    // Unary minus prefix, e.g. `-x` or `-100`.
    if (peek()?.type === "punct" && peek()?.value === "-") {
      advance(); // '-'
      const operand = parseExpression();
      return { kind: "Unary", operator: "-", operand };
    }
    return parsePrimary();
  }

  function parseStatement(): Stmt {
    const token = peek();
    if (token?.type === "keyword" && token.value === "let") {
      advance(); // 'let'
      const name = advance();
      if (name.type !== "identifier") {
        throw new ParseError("Expected an identifier after 'let'");
      }
      // Optional type annotation: `let x : U8 = ...`.
      let type: Type | undefined;
      if (peek()?.type === "punct" && peek()?.value === ":") {
        advance(); // ':'
        type = parseType();
      }
      expectPunct("=");
      const value = parseExpression();
      consumeSemicolon();
      return { kind: "VariableDecl", name: name.value, type, value };
    }
    const expr = parseExpression();
    consumeSemicolon();
    return { kind: "ExprStmt", expr };
  }

  function parseBody(): Stmt[] {
    const stmts: Stmt[] = [];
    while (peek() !== undefined) {
      stmts.push(parseStatement());
    }
    return stmts;
  }

  const params = parseDeclarationBlock();
  const body = parseBody();
  return { kind: "Program", params, body };
}
