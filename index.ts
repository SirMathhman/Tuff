type Token =
  | { type: "num"; value: number }
  | { type: "op"; op: "+" | "-" | "*" | "/" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j] ?? "")) j++;
      tokens.push({ type: "num", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", op: ch });
      i++;
      continue;
    }
    throw new Error(`evaluate: unexpected character "${ch}" in "${input}"`);
  }
  return tokens;
}

function parseExpression(tokens: Token[], pos: number): [number, number] {
  let [value, next] = parseTerm(tokens, pos);
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
      const [rhs, after] = parseTerm(tokens, next + 1);
      value = tok.op === "+" ? value + rhs : value - rhs;
      next = after;
    } else {
      break;
    }
  }
  return [value, next];
}

function parseTerm(tokens: Token[], pos: number): [number, number] {
  let [value, next] = parseFactor(tokens, pos);
  while (next < tokens.length) {
    const tok = tokens[next];
    if (tok && tok.type === "op" && (tok.op === "*" || tok.op === "/")) {
      const [rhs, after] = parseFactor(tokens, next + 1);
      value = tok.op === "*" ? value * rhs : value / rhs;
      next = after;
    } else {
      break;
    }
  }
  return [value, next];
}

function parseFactor(tokens: Token[], pos: number): [number, number] {
  const tok = tokens[pos];
  if (!tok) throw new Error(`evaluate: unexpected end of expression`);
  if (tok.type === "num") return [tok.value, pos + 1];
  throw new Error(`evaluate: expected a number at position ${pos}`);
}

export function evaluate(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const [value, next] = parseExpression(tokens, 0);
  if (next !== tokens.length) {
    throw new Error(`evaluate: unexpected trailing tokens in "${input}"`);
  }
  return value;
}
