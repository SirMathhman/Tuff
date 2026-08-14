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

  function parseNumber(token: string): number {
    const value = Number(token);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid number: "${token}"`);
    }
    return value;
  }

  function parseFactor(): number {
    const open = tokens[pos];
    if (open === "(" || open === "{") {
      const close = open === "(" ? ")" : "}";
      pos++;
      const result = parseExpr();
      if (tokens[pos] !== close) {
        throw new Error(
          `Expected closing bracket "${close}" but found "${tokens[pos] || "end of input"}"`,
        );
      }
      pos++;
      return result;
    }
    return parseNumber(tokens[pos++]!);
  }

  return parseExpr();
}

console.log("Hello via Bun!");
