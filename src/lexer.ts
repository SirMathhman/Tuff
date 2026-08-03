export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" };

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;

    if (char === " ") {
      i++;
      continue;
    }

    if (char >= "0" && char <= "9") {
      let value = "";
      while (i < source.length && source[i]! >= "0" && source[i]! <= "9") {
        value += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(value) });
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}
