export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === '') return 0;

  // Tokenize into numbers, operators, grouping brackets, punctuation, and identifiers
  const matchResult = trimmed.match(/(\d+|[+\-\*\/(\){}=;]+|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/g);
  if (!matchResult) return 0;
  const tokens: string[] = matchResult;

  // Build symbol table from tokens: find "let <name> =" patterns sequentially
  const knownIdentifiers = new Set(["let"]);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'let' && tokens[i + 2] === '=' && tokens[i + 1]) {
      knownIdentifiers.add(tokens[i + 1]);
    }
  }
  // Validate: throw on any identifier not in the symbol table
  for (const t of tokens) {
    if (!/(\d+|[+\-\*\/(\){}=;])/.test(t)) {
      if (!knownIdentifiers.has(t)) {
        throw new ReferenceError(`"${t}" is not defined`);
      }
    }
  }
  // Filter parseable tokens (numbers, operators, brackets) — skip keywords and identifiers
  const parseTokens = tokens.filter(t => /(\d+|[+\-\*\/(\){}])/.test(t));

  // If source contains an assignment but no expression (only numbers), treat as statement-only → 0
  if (source.includes('=') && !parseTokens.some(t => /[+\-\*\/()\{\}]/.test(t))) {
    return 0;
  }
  let pos = 0;

  function peek(): string | undefined {
    return parseTokens[pos];
  }

  function consume(): string {
    return parseTokens[pos++]!;
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

