export function interpret(input: string): number {
  if (input === "") return 0;

  const tokens = input
    .split(/(\+|-|\*|\/|\(|\)|\{|\})/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

  let pos = 0;

  function parseExpr(): number {
    let result = parseTerm();
    while (
      pos < tokens.length &&
      (tokens[pos] === "+" || tokens[pos] === "-")
    ) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (
      pos < tokens.length &&
      (tokens[pos] === "*" || tokens[pos] === "/")
    ) {
      const op = tokens[pos++];
      const right = parseFactor();
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseFactor(): number {
    if (tokens[pos] === "(" || tokens[pos] === "{") {
      pos++; // consume '(' or '{'
      const result = parseExpr();
      pos++; // consume ')' or '}'
      return result;
    }
    return Number(tokens[pos++]);
  }

  return parseExpr();
}

console.log("Hello via Bun!");
