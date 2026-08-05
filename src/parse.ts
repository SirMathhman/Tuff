import type { Token } from "./tokenize";
import type { Expr, LetDeclNode } from "./ast";

/** Maps opening delimiters to their closing counterparts */
const CLOSING_DELIMITER: Record<string, string> = {
  "(": ")",
  "{": "}",
};

export class Parser {
  private tokens: Token[];
  pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  consume(): Token {
    const token = this.tokens[this.pos++];
    if (token === undefined) throw new Error(`Unexpected end of input at position ${this.pos}`);
    return token;
  }

  parseExpr(): Expr {
    let result: Expr = this.parseTerm();

    while (true) {
      const next = this.peek();
      if (!(next?.type === "operator" && (next.value === "+" || next.value === "-"))) break;
      this.consume(); // discard operator token
      const right = this.parseTerm();
      result = { type: "binop", op: next.value, left: result, right };
    }

    return result;
  }

  parseTerm(): Expr {
    let result: Expr = this.parseFactor();

    while (true) {
      const next = this.peek();
      if (!(next?.type === "operator" && (next.value === "*" || next.value === "/"))) break;
      this.consume(); // discard operator token
      const right = this.parseFactor();
      result = { type: "binop", op: next.value, left: result, right };
    }

    return result;
  }

  parseFactor(): Expr {
    const token = this.peek();

    // Parenthesized expression `( expr )`
    if (token?.type === "paren" && CLOSING_DELIMITER[token.value] && token.value !== "{") {
      const openValue = token.value;
      this.consume(); // discard opening delimiter
      const expr = this.parseExpr();
      const close = this.consume();
      const expectedClose = CLOSING_DELIMITER[openValue];
      if (!(close.type === "paren" && close.value === expectedClose)) {
        throw new Error(`Expected '${expectedClose}' at position ${this.pos}`);
      }
      return expr;
    }

    // Block `{ stmts }`
    if (token?.type === "paren" && token.value === "{") {
      this.consume(); // discard '{'
      const statements: (Expr | LetDeclNode)[] = [];
      while (true) {
        const next = this.peek();
        if (!next || (next.type === "paren" && next.value === "}")) break;

        // Parse let declaration
        if (next.type === "keyword" && next.value === "let") {
          this.consume(); // discard 'let'
          const nameToken = this.consume();
          if (!(nameToken.type === "identifier")) {
            throw new Error(`Expected identifier after 'let' at position ${this.pos}`);
          }
          const eqToken = this.consume();
          if (!(eqToken.type === "operator" && eqToken.value === "=")) {
            throw new Error(`Expected '=' after variable name at position ${this.pos}`);
          }
          const valueExpr = this.parseExpr();
          statements.push({ type: "letdecl", name: nameToken.value, value: valueExpr });
        } else {
          statements.push(this.parseExpr());
        }

        // Consume semicolon if present (optional before '}')
        const semi = this.peek();
        if (semi?.type === "semicolon") {
          this.consume();
        }
      }
      const close = this.consume();
      if (!(close.type === "paren" && close.value === "}")) {
        throw new Error(`Expected '}' at position ${this.pos}`);
      }
      return { type: "block", statements };
    }

    // Variable reference
    if (token?.type === "identifier") {
      this.consume();
      return { type: "varref", name: token.value };
    }

    // Number literal
    if (!token || token.type !== "number") {
      throw new Error(`Expected number or '(' at position ${this.pos}, got: ${JSON.stringify(token)}`);
    }
    this.consume();
    return { type: "number", value: token.value };
  }
}

/**
 * Recursive-descent parser with operator precedence.
 *   expr  -> term (('+' | '-') term)*
 *   term  -> factor (('*' | '/') factor)*
 *   factor -> '(' expr ')' | '{' expr '}' | number
 */
export function parse(tokens: Token[]): Expr {
  if (tokens.length === 0) return { type: "number", value: 0 };
  const parser = new Parser(tokens);
  return parser.parseExpr();
}
