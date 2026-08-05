export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === '') return 0;

  // Tokenize into numbers, operators, and grouping brackets
  const matchResult = trimmed.match(/(\d+|[+\-\*\/(\){}])/g);
  if (!matchResult) return 0;
  const tokens: string[] = matchResult;
  // If source contains an assignment but no expression (only numbers), treat as statement-only → 0
  if (source.includes('=') && !tokens.some(t => /[+\-\*\/()\{\}]/.test(t))) {
    return 0;
  }
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

  // parseFactor handles grouping brackets and numbers (highest precedence)
  function parseFactor(): number {
    if (peek() === '(' || peek() === '{') {
      consume(); // consume opening bracket
      const result = parseExpression();
      consume(); // consume closing bracket
      return result;
    }
    return Number(consume());
  }

  return parseExpression();
}
