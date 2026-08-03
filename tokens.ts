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

  for (const part of source.split(" ")) {
    if (part === "") {
      continue;
    }

    if (part === "+") {
      tokens.push({ type: "plus" });
    } else if (part === "-") {
      tokens.push({ type: "minus" });
    } else if (part === "*") {
      tokens.push({ type: "star" });
    } else if (part === "(") {
      tokens.push({ type: "lparen" });
    } else if (part === ")") {
      tokens.push({ type: "rparen" });
    } else if (part.startsWith("(") && part.endsWith(")")) {
      tokens.push({ type: "lparen" });
      tokens.push({ type: "number", value: Number(part.slice(1, -1)) });
      tokens.push({ type: "rparen" });
    } else if (part.startsWith("(")) {
      tokens.push({ type: "lparen" });
      tokens.push({ type: "number", value: Number(part.slice(1)) });
    } else if (part.endsWith(")")) {
      tokens.push({ type: "number", value: Number(part.slice(0, -1)) });
      tokens.push({ type: "rparen" });
    } else {
      tokens.push({ type: "number", value: Number(part) });
    }
  }

  tokens.push({ type: "eof" });
  return tokens;
}
