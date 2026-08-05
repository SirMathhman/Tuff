export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === '') return 0;

  // Tokenize into numbers, operators, and parentheses
  const matchResult = trimmed.match(/(\d+|[+\-\*\/()])/g);
  if (!matchResult) return 0;
  const tokens: string[] = matchResult;

  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(): string {
    return tokens[pos++]!;
  }

  // parseExpression handles + and - (lowest precedence)
  function parseExpression(): number {
    let result = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const next = parseTerm();
      if (op === '+') result += next;
      else result -= next;
    }
    return result;
  }

  // parseTerm handles * and / (higher precedence)
  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const next = parseFactor();
      if (op === '*') result *= next;
      else result /= next;
    }
    return result;
  }

  // parseFactor handles parentheses and numbers (highest precedence)
  function parseFactor(): number {
    if (peek() === '(') {
      consume(); // consume '('
      const result = parseExpression();
      consume(); // consume ')'
      return result;
    }
    return Number(consume());
  }

  return parseExpression();
}
