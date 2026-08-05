import { Token } from "./tokenize";

/**
 * Simple recursive-descent evaluator with operator precedence.
 *   expr  -> term (('+' | '-') term)*
 *   term  -> number (('*' | '/') number)*
 */
export function evaluateTokens(tokens: Token[]): number {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++];
  }

  // expr handles + and - (lowest precedence)
  function parseExpr(): number {
    let result = parseTerm();

    while (peek()?.type === "operator" && (peek().value === "+" || peek().value === "-")) {
      const op = consume().value;
      const right = parseTerm();
      if (op === "+") result += right;
      else result -= right;
    }

    return result;
  }

  // term handles * and / (higher precedence)
  function parseTerm(): number {
    let result = parseNumber();

    while (peek()?.type === "operator" && (peek().value === "*" || peek().value === "/")) {
      const op = consume().value;
      const right = parseNumber();
      if (op === "*") result *= right;
      else result /= right;
    }

    return result;
  }

  // number consumes a single numeric token
  function parseNumber(): number {
    const token = peek();
    if (!token || token.type !== "number") {
      throw new Error(`Expected number at position ${pos}, got: ${JSON.stringify(token)}`);
    }
    consume();
    return token.value;
  }

  // Entry point
  if (tokens.length === 0) return 0;
  return parseExpr();
}
