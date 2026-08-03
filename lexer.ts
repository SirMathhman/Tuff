import { LexError } from "./errors";

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
  let lastIndex = 0;
  while ((match = regex.exec(source)) !== null) {
    const gap = source.slice(lastIndex, match.index);
    if (/\S/.test(gap)) {
      const bad = gap.match(/\S/)![0];
      throw new LexError(
        `Unexpected character: ${bad}`,
        lastIndex + gap.indexOf(bad)
      );
    }
    lastIndex = regex.lastIndex;
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
  const trailing = source.slice(lastIndex);
  if (/\S/.test(trailing)) {
    const bad = trailing.match(/\S/)![0];
    throw new LexError(
      `Unexpected character: ${bad}`,
      lastIndex + trailing.indexOf(bad)
    );
  }
  return tokens;
}
