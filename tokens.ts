export type Token =
  | { type: "number"; value: number }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "eof" };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === " ") {
      i++;
    } else if (ch === "+") {
      tokens.push({ type: "plus" });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "minus" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "star" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
    } else {
      let value = "";
      while (i < source.length && /\d/.test(source[i]!)) {
        value += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(value) });
    }
  }

  tokens.push({ type: "eof" });
  return tokens;
}
