type Token =
  | { type: "Number"; value: string }
  | { type: "Plus" }
  | { type: "Eof" };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i]!)) {
      i++;
    } else if (/\d/.test(src[i]!)) {
      let start = i;
      while (i < src.length && /\d/.test(src[i]!)) i++;
      tokens.push({ type: "Number", value: src.slice(start, i) });
    } else if (src[i] === "+") {
      tokens.push({ type: "Plus" });
      i++;
    } else {
      throw new Error(`Unexpected token: ${src[i]!}`);
    }
  }
  tokens.push({ type: "Eof" });
  return tokens;
}

function parseExpression(tokens: Token[]): string {
  return parseAddition(tokens);
}

function parseAddition(tokens: Token[]): string {
  let left = parseNumber(tokens);
  while (tokens[0]?.type === "Plus") {
    tokens.shift();
    const right = parseNumber(tokens);
    left = `(${left} + ${right})`;
  }
  return left;
}

function parseNumber(tokens: Token[]): string {
  const token = tokens.shift();
  if (token?.type === "Number") return token.value;
  if (token?.type === "Eof") return "0";
  throw new Error(`Expected number, got ${token?.type ?? "nothing"}`);
}

export function compileTuffToJS(tuffSource: string): string {
  const lastSemi = tuffSource.lastIndexOf(";");
  const tail = lastSemi >= 0 ? tuffSource.slice(lastSemi + 1) : tuffSource;
  const tokens = tokenize(tail);
  const expr = parseExpression(tokens);
  return `return ${expr};`;
}
