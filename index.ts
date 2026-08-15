/**
 * Evaluates a simple arithmetic expression string.
 * An empty (or whitespace-only) expression evaluates to 0.
 */
export function evaluate(input: string): number {
  const expr = input.trim();
  if (expr === "") return 0;

  // Evaluate a basic arithmetic expression using a safe parser.
  // Supports +, -, *, /, parentheses, and numeric literals.
  let pos = 0;

  function parseExpression(): number {
    let value = parseTerm();
    while (pos < expr.length) {
      const ch = expr[pos];
      if (ch === "+") {
        pos++;
        value += parseTerm();
      } else if (ch === "-") {
        pos++;
        value -= parseTerm();
      } else {
        break;
      }
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (pos < expr.length) {
      const ch = expr[pos];
      if (ch === "*") {
        pos++;
        value *= parseFactor();
      } else if (ch === "/") {
        pos++;
        value /= parseFactor();
      } else {
        break;
      }
    }
    return value;
  }

  function parseFactor(): number {
    skipWhitespace();
    if (pos >= expr.length) throw new Error("Unexpected end of expression");

    const ch = expr[pos];
    if (ch === "-") {
      pos++;
      return -parseFactor();
    }
    if (ch === "+") {
      pos++;
      return parseFactor();
    }
    if (ch === "(") {
      pos++;
      const value = parseExpression();
      skipWhitespace();
      if (expr[pos] !== ")") throw new Error("Expected ')'");
      pos++;
      return value;
    }

    // Parse a numeric literal
    const start = pos;
    while (pos < expr.length && (/\d/.test(expr[pos]) || expr[pos] === ".")) {
      pos++;
    }
    if (pos === start) throw new Error(`Unexpected character '${ch}'`);
    const num = Number(expr.slice(start, pos));
    if (Number.isNaN(num)) throw new Error(`Invalid number at position ${start}`);
    return num;
  }

  function skipWhitespace() {
    while (pos < expr.length && /\s/.test(expr[pos])) pos++;
  }

  const result = parseExpression();
  skipWhitespace();
  if (pos < expr.length) throw new Error(`Unexpected character at position ${pos}`);
  return result;
}