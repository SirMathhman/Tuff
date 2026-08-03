export type Token =
  | { type: "number"; value: number }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "slash" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\d+|[+\-*/(){}]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const text = match[0];
    if (/\d+/.test(text)) {
      tokens.push({ type: "number", value: Number(text) });
    } else {
      switch (text) {
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
        case "{":
          tokens.push({ type: "lbrace" });
          break;
        case "}":
          tokens.push({ type: "rbrace" });
          break;
      }
    }
  }
  return tokens;
}
