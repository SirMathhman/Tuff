export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" }
  | { type: "paren"; value: "(" | ")" };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
    } else if (ch >= "0" && ch <= "9") {
      let numStr = "";
      while (i < source.length) {
        const c = source.charAt(i);
        if (c < "0" || c > "9") break;
        numStr += c;
        i++;
      }
      tokens.push({ type: "number", value: Number(numStr) });
    } else if (ch === "+") {
      tokens.push({ type: "operator", value: "+" });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "operator", value: "-" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "operator", value: "*" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "paren", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "paren", value: ")" });
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}
