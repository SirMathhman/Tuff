export type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "slash" }
  | { type: "equals" }
  | { type: "semicolon" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" };

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
    if (/[a-zA-Z_]/.test(char)) {
      let name = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
        name += source[i++];
      }
      tokens.push({ type: "identifier", name });
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
      case "=":
        tokens.push({ type: "equals" });
        break;
      case ";":
        tokens.push({ type: "semicolon" });
        break;
      case "(":
        tokens.push({ type: "lparen" });
        break;
      case ")":
        tokens.push({ type: "rparen" });
        break;
      case "{":
        tokens.push({ type: "lbrace" });
        break;
      case "}":
        tokens.push({ type: "rbrace" });
        break;
      default:
        throw new Error(`Unexpected character: ${char}`);
    }
    i++;
  }
  return tokens;
}
