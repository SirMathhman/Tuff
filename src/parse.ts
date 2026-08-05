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

  // term handles * and / (higher precedence)
  function parseTerm(): Expr {
    let result: Expr = parseNumber();

    while (true) {
      const next = peek();
      if (!(next?.type === "operator" && (next.value === "*" || next.value === "/"))) break;
      consume(); // discard operator token
      const right = parseNumber();
      result = { type: "binop", op: next.value, left: result, right };
    }

    return result;
  }

  // number consumes a single numeric token
  function parseNumber(): Expr {
    const token = peek();
    if (!token || token.type !== "number") {
      throw new Error(`Expected number at position ${pos}, got: ${JSON.stringify(token)}`);
    }
    consume();
    return { type: "number", value: token.value };
  }

  // Entry point
  if (tokens.length === 0) return { type: "number", value: 0 };
  return parseExpr();
}
