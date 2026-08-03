export type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "let" }
  | { type: "assign" }
  | { type: "semicolon" }
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
  const regex = /\d+|[a-zA-Z_]\w*|[+\-*/(){};=]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const text = match[0];
    if (/\d+/.test(text)) {
      tokens.push({ type: "number", value: Number(text) });
    } else if (/[a-zA-Z_]\w*/.test(text)) {
      if (text === "let") {
        tokens.push({ type: "let" });
      } else {
        tokens.push({ type: "identifier", name: text });
      }
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
        case "=":
          tokens.push({ type: "assign" });
          break;
        case ";":
          tokens.push({ type: "semicolon" });
          break;
      }
    }
  }
  return tokens;
}
