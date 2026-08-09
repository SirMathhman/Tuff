type Token =
  | { type: "Number"; value: string }
  | { type: "Plus" }
  | { type: "Minus" }
  | { type: "Star" }
  | { type: "Slash" }
  | { type: "LParen" }
  | { type: "RParen" }
  | { type: "LBrace" }
  | { type: "RBrace" }
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
    } else if (src[i] === "-") {
      tokens.push({ type: "Minus" });
      i++;
    } else if (src[i] === "*") {
      tokens.push({ type: "Star" });
      i++;
    } else if (src[i] === "/") {
      tokens.push({ type: "Slash" });
      i++;
    } else if (src[i] === "(") {
      tokens.push({ type: "LParen" });
      i++;
    } else if (src[i] === ")") {
      tokens.push({ type: "RParen" });
      i++;
    } else if (src[i] === "{") {
      tokens.push({ type: "LBrace" });
      i++;
    } else if (src[i] === "}") {
      tokens.push({ type: "RBrace" });
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
  let left = parseMultiplication(tokens);
  while (tokens[0]?.type === "Plus" || tokens[0]?.type === "Minus") {
    const op = tokens[0]!.type === "Plus" ? "+" : "-";
    tokens.shift();
    const right = parseMultiplication(tokens);
    left = `(${left} ${op} ${right})`;
  }
  return left;
}

function parseMultiplication(tokens: Token[]): string {
  let left = parsePrimary(tokens);
  while (tokens[0]?.type === "Star" || tokens[0]?.type === "Slash") {
    const op = tokens[0]!.type === "Star" ? "*" : "/";
    tokens.shift();
    const right = parsePrimary(tokens);
    if (op === "/") {
      left = `(Math.trunc(${left} / ${right}))`;
    } else {
      left = `(${left} * ${right})`;
    }
  }
  return left;
}

function parseGrouped(tokens: Token[], closeType: string, expected: string): string {
  const expr = parseExpression(tokens);
  const closing = tokens.shift();
  if (closing?.type !== closeType)
    throw new Error(`Expected '${expected}', got ${closing?.type ?? "nothing"}`);
  return `(${expr})`;
}

function parsePrimary(tokens: Token[]): string {
  const token = tokens.shift();
  if (token?.type === "Number") return token.value;
  if (token?.type === "LParen") return parseGrouped(tokens, "RParen", ")");
  if (token?.type === "LBrace") return parseGrouped(tokens, "RBrace", "}");
  if (token?.type === "Eof") return "0";
  throw new Error(`Expected number or '(', got ${token?.type ?? "nothing"}`);
}

export function compileTuffToJS(tuffSource: string): string {
  const lastSemi = tuffSource.lastIndexOf(";");
  const tail = lastSemi >= 0 ? tuffSource.slice(lastSemi + 1) : tuffSource;
  const tokens = tokenize(tail);
  const expr = parseExpression(tokens);
  return `return ${expr};`;
}
