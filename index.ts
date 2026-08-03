export function interpret(source: string): number {
  const tokens = source.match(/\d+|[+\-*/()]/g) ?? [];
  if (tokens.length === 0) {
    return 0;
  }
  let pos = 0;

  function parseAdditive(): number {
    let value = parseMultiplicative();
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++];
      const right = parseMultiplicative();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseMultiplicative(): number {
    let value = parsePrimary();
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos++];
      const right = parsePrimary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  function parsePrimary(): number {
    if (tokens[pos] === "(") {
      pos++;
      const value = parseAdditive();
      pos++; // consume ")"
      return value;
    }
    return Number(tokens[pos++]);
  }

  return parseAdditive();
}
