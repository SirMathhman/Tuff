export type Token =
  | { type: "number"; value: number }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
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
    } else {
      tokens.push({ type: "number", value: Number(part) });
    }
  }

  tokens.push({ type: "eof" });
  return tokens;
}
