import type { Token } from "./tokenize";
import type { Expr } from "./ast";

/**
 * Recursive-descent parser with operator precedence.
 *   expr  -> term (('+' | '-') term)*
 *   term  -> number (('*' | '/') number)*
 */
export function parse(tokens: Token[]): Expr {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    const token = tokens[pos++];
    if (token === undefined) throw new Error(`Unexpected end of input at position ${pos}`);
    return token;
  }

  // expr handles + and - (lowest precedence)
  function parseExpr(): Expr {
    let result: Expr = parseTerm();

    while (true) {
      const next = peek();
      if (!(next?.type === "operator" && (next.value === "+" || next.value === "-"))) break;
      consume(); // discard operator token
      const right = parseTerm();
      result = { type: "binop", op: next.value, left: result, right };
    }

    return result;
  }

  // Remove old parseNumber reference — replaced by parseFactor

  // term handles * and / (higher precedence)
  function parseTerm(): Expr {
    let result: Expr = parseFactor();

    while (true) {
      const next = peek();
      if (!(next?.type === "operator" && (next.value === "*" || next.value === "/"))) break;
      consume(); // discard operator token
      const right = parseFactor();
      result = { type: "binop", op: next.value, left: result, right };
    }

    return result;
  }

  // factor handles parenthesized sub-expressions and numbers
  function parseFactor(): Expr {
    const token = peek();
    if (token?.type === "paren" && token.value === "(") {
      consume(); // discard '('
      const expr = parseExpr();
      const close = consume();
      if (!(close.type === "paren" && close.value === ")")) {
        throw new Error(`Expected ')' at position ${pos}`);
      }
      return expr;
    }
    if (!token || token.type !== "number") {
      throw new Error(`Expected number or '(' at position ${pos}, got: ${JSON.stringify(token)}`);
    }
    consume();
    return { type: "number", value: token.value };
  }

  // Entry point
  if (tokens.length === 0) return { type: "number", value: 0 };
  return parseExpr();
}
