import type { Token } from "./tokenize";

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
    const token = tokens[pos++];
    if (token === undefined) throw new Error(`Unexpected end of input at position ${pos}`);
    return token;
  }

  // expr handles + and - (lowest precedence)
  function parseExpr(): number {
    let result = parseTerm();

    while (true) {
      const next = peek();
      if (!(next?.type === "operator" && (next.value === "+" || next.value === "-"))) break;
      consume(); // discard operator token
      const right = parseTerm();
      if (next.value === "+") result += right;
      else result -= right;
    }

    return result;
  }

  // term handles * and / (higher precedence)
  function parseTerm(): number {
    let result = parseNumber();

    while (true) {
      const next = peek();
      if (!(next?.type === "operator" && (next.value === "*" || next.value === "/"))) break;
      consume(); // discard operator token
      const right = parseNumber();
      if (next.value === "*") result *= right;
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
