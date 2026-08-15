export function evaluate(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const value = parseExpression(tokens, 0);
  if (value.pos !== tokens.length) {
    throw new Error(`Unexpected token: ${tokens[value.pos]}`);
  }
  return value.value;
}

type Token = number | "+" | "-" | "*" | "/" | "(" | ")" | "{" | "}";

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input[i]!)) {
        num += input[i]!;
        i++;
      }
      const value = Number(num);
      if (Number.isNaN(value)) throw new Error(`Invalid number: ${num}`);
      tokens.push(value);
    } else if ("+-*/(){}".includes(ch)) {
      tokens.push(ch as Token);
      i++;
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  return tokens;
}

function parseExpression(
  tokens: Token[],
  pos: number,
): { value: number; pos: number } {
  let { value, pos: next } = parseTerm(tokens, pos);
  while (
    next < tokens.length &&
    (tokens[next] === "+" || tokens[next] === "-")
  ) {
    const op = tokens[next] as "+" | "-";
    const rhs = parseTerm(tokens, next + 1);
    value = op === "+" ? value + rhs.value : value - rhs.value;
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseTerm(
  tokens: Token[],
  pos: number,
): { value: number; pos: number } {
  let { value, pos: next } = parseFactor(tokens, pos);
  while (
    next < tokens.length &&
    (tokens[next] === "*" || tokens[next] === "/")
  ) {
    const op = tokens[next] as "*" | "/";
    const rhs = parseFactor(tokens, next + 1);
    value = op === "*" ? value * rhs.value : value / rhs.value;
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseFactor(
  tokens: Token[],
  pos: number,
): { value: number; pos: number } {
  const token = tokens[pos];
  if (token === undefined) throw new Error("Unexpected end of input");
  if (token === "+") return parseFactor(tokens, pos + 1);
  if (token === "-") {
    const { value, pos: next } = parseFactor(tokens, pos + 1);
    return { value: -value, pos: next };
  }
  if (token === "(" || token === "{") {
    const { value, pos: next } = parseExpression(tokens, pos + 1);
    const closing = token === "(" ? ")" : "}";
    if (tokens[next] !== closing) throw new Error(`Expected '${closing}'`);
    return { value, pos: next + 1 };
  }
  if (typeof token === "number") return { value: token, pos: pos + 1 };
  throw new Error(`Unexpected token: ${token}`);
}
