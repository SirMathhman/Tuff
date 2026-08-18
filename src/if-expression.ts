import type { ParserApi } from "./parser-api.js";

/**
 * Parses an if expression `if (condition) then else other`. The
 * condition is a parenthesized expression; a non-zero condition selects
 * the then branch, otherwise the else branch. Both branches are full
 * expressions. Returns null when the expression is malformed.
 */
export function parseIfExpression(parser: ParserApi): number | null {
  parser.advance(); // "if"
  if (parser.peek() !== "(") {
    return null;
  }
  parser.advance();
  const condition = parser.parseExpression();
  if (condition === null || parser.peek() !== ")") {
    return null;
  }
  parser.advance();
  const thenValue = parser.parseExpression();
  if (thenValue === null || parser.peek() !== "else") {
    return null;
  }
  parser.advance();
  const elseValue = parser.parseExpression();
  if (elseValue === null) {
    return null;
  }
  return condition !== 0 ? thenValue : elseValue;
}
