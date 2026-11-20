function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern = /\s*(\d+|[-+*/()])/y;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (match === null) {
      if (source.slice(index).trim() === "") break;
      throw new Error(`Unexpected character at position ${index}`);
    }
    tokens.push(match[1] ?? "");
    index = pattern.lastIndex;
  }
  return tokens;
}

export function evaluateTuff(tuffSource: string): number {
  const tokens = tokenize(tuffSource);
  let pos = 0;

  const peek = (): string | undefined => tokens[pos];
  const next = (): string => {
    const token = tokens[pos++];
    if (token === undefined) throw new Error("Unexpected end of input");
    return token;
  };

  const factor = (): number => {
    const token = next();
    if (token === "(") {
      const value = expression();
      if (next() !== ")") throw new Error("Expected ')'");
      return value;
    }
    if (/^\d+$/.test(token)) return Number(token);
    throw new Error(`Unexpected token '${token}'`);
  };

  const term = (): number => {
    let value = factor();
    for (let op = peek(); op === "*" || op === "/"; op = peek()) {
      pos++;
      const right = factor();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };

  const expression = (): number => {
    let value = term();
    for (let op = peek(); op === "+" || op === "-"; op = peek()) {
      pos++;
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };

  const result = expression();
  if (pos !== tokens.length) throw new Error(`Unexpected token '${tokens[pos]}'`);
  return result;
}
