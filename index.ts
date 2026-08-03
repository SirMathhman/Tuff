export function evaluate(source: string): number {
  const tokens = source.match(/\d+|[+\-*/()]/g) ?? [];
  if (tokens.length === 0) {
    return 0;
  }
  let index = 0;

  function parseExpression(): number {
    let value = parseTerm();
    while (index < tokens.length && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (index < tokens.length && (tokens[index] === "*" || tokens[index] === "/")) {
      const operator = tokens[index++];
      const right = parseFactor();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseFactor(): number {
    if (tokens[index] === "(") {
      index++;
      const value = parseExpression();
      index++; // consume ")"
      return value;
    }
    return Number(tokens[index++]);
  }

  return parseExpression();
}
