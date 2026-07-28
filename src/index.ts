type Token = { type: "number"; value: number } | { type: "operator"; value: "+" };

function tokenize(source: string): Token[] {
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
    } else {
      i++;
    }
  }
  return tokens;
}

function evaluate(tokens: Token[]): number {
  let result = 0;
  let i = 0;
  result = parseNumber(tokens, i);
  i++;
  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== undefined && op.type === "operator" && op.value === "+") {
      i++;
      const right = parseNumber(tokens, i);
      result = result + right;
      i++;
    } else {
      i++;
    }
  }
  return result;
}

function parseNumber(tokens: Token[], index: number): number {
  const token = tokens[index];
  if (token !== undefined && token.type === "number") {
    return token.value;
  }
  return 0;
}

export function interpret(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") {
    return 0;
  }
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return 0;
  }
  return evaluate(tokens);
}
