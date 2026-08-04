export type Token =
  | { type: "number"; value: number }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "slash" }
  | { type: "lparen" }
  | { type: "rparen" };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (/\d/.test(char)) {
      let value = "";
      while (i < source.length && /\d/.test(source[i])) {
        value += source[i++];
      }
      tokens.push({ type: "number", value: Number(value) });
      continue;
    }
    switch (char) {
      case "+":
        tokens.push({ type: "plus" });
        break;
      case "-":
        tokens.push({ type: "minus" });
        break;
      case "*":
        tokens.push({ type: "star" });
        break;
      case "/":
        tokens.push({ type: "slash" });
        break;
      case "(":
        tokens.push({ type: "lparen" });
        break;
      case ")":
        tokens.push({ type: "rparen" });
        break;
      default:
        throw new Error(`Unexpected character: ${char}`);
    }
    i++;
  }
  return tokens;
}
