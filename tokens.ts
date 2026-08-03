export type Token =
  | { type: "number"; value: number }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "let" }
  | { type: "mut" }
  | { type: "identifier"; name: string }
  | { type: "equals" }
  | { type: "semicolon" }
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
    } else if (ch === "{") {
      tokens.push({ type: "lbrace" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "rbrace" });
      i++;
    } else if (ch === "=") {
      tokens.push({ type: "equals" });
      i++;
    } else if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
    } else if (/\d/.test(ch!)) {
      let value = "";
      while (i < source.length && /\d/.test(source[i]!)) {
        value += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(value) });
    } else if (/[a-zA-Z]/.test(ch!)) {
      let name = "";
      while (i < source.length && /[a-zA-Z]/.test(source[i]!)) {
        name += source[i];
        i++;
      }
      if (name === "let") {
        tokens.push({ type: "let" });
      } else if (name === "mut") {
        tokens.push({ type: "mut" });
      } else {
        tokens.push({ type: "identifier", name });
      }
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }

  tokens.push({ type: "eof" });
  return tokens;
}
