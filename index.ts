type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    const numMatch = input.slice(i).match(/^\d+(\.\d+)?/);
    if (numMatch) {
      tokens.push({ type: "num", value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    throw new Error(`interpret: unexpected character "${ch}" in "${input}"`);
  }
  return tokens;
}

function parseExpression(tokens: Token[]): number {
  let left = parseTerm(tokens);
  for (;;) {
    const t = tokens[0];
    if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      tokens.shift();
      const right = parseTerm(tokens);
      left = t.value === "+" ? left + right : left - right;
    } else {
      break;
    }
  }
  return left;
}

function parseTerm(tokens: Token[]): number {
  let left = parseFactor(tokens);
  for (;;) {
    const t = tokens[0];
    if (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
      tokens.shift();
      const right = parseFactor(tokens);
      left = t.value === "*" ? left * right : left / right;
    } else {
      break;
    }
  }
  return left;
}

function parseFactor(tokens: Token[]): number {
  const t = tokens.shift();
  if (!t) {
    throw new Error("interpret: unexpected end of expression");
  }
  if (t.type === "num") {
    return t.value;
  }
  if (t.type === "op" && t.value === "-") {
    return -parseFactor(tokens);
  }
  throw new Error("interpret: expected a number");
}

export function interpret(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") {
    return 0;
  }
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return 0;
  }
  const result = parseExpression(tokens);
  if (tokens.length > 0) {
    throw new Error(`interpret: invalid expression "${input}"`);
  }
  return result;
}
