import type { ParserApi } from "./parser-api.js";

/**
 * Parses a statement block `{` statement* `}`. Unlike a block used as an
 * expression, a statement block contains only statements and omits the
 * trailing expression. When the block instead has a trailing expression
 * (making it an expression block), the position is restored and the
 * caller is left to parse it as an expression. Returns false only when a
 * statement inside the block is malformed.
 */
export function parseStatementBlock(parser: ParserApi): boolean {
  const startPos = parser.pos;
  parser.advance(); // "{"
  parser.scopes.push(new Map());
  const ok = parser.parseStatements();
  parser.scopes.pop();
  if (!ok) {
    return false;
  }
  if (parser.peek() !== "}") {
    // A trailing expression is present: this is an expression block, not
    // a statement block. Backtrack so the caller parses it as an
    // expression.
    parser.pos = startPos;
    return true;
  }
  parser.advance();
  return true;
}
