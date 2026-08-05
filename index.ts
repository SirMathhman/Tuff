export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === '') return 0;

  // Tokenize into numbers and operators
  const matchResult = trimmed.match(/(\d+|[+\-\*\/])/g);
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
    let result = Number(consume()); // consume the number
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const next = Number(consume());
      if (op === '*') result *= next;
      else result /= next;
    }
    return result;
  }

  return parseExpression();
}
