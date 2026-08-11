type Token = ["NUM", number] | ["OP", string] | ["EOF", null];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      let num = "";
      while (i < input.length && /\d/.test(input[i]!)) {
        num += input[i]!;
        i++;
      }
      tokens.push(["NUM", Number(num)]);
    } else {
      tokens.push(["OP", ch]);
      i++;
    }
  }
  tokens.push(["EOF", null]);
  return tokens;
}

function parseExpr(tokens: Token[], pos: [number]): number {
  let left = parseTerm(tokens, pos);
  while (
    tokens[pos[0]]![0] === "OP" &&
    (tokens[pos[0]]![1] === "+" || tokens[pos[0]]![1] === "-")
  ) {
    const op = tokens[pos[0]++]![1] as "+" | "-";
    const right = parseTerm(tokens, pos);
    left = op === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: Token[], pos: [number]): number {
  let left = parseFactor(tokens, pos);
  while (
    tokens[pos[0]]![0] === "OP" &&
    (tokens[pos[0]]![1] === "*" || tokens[pos[0]]![1] === "/")
  ) {
    const op = tokens[pos[0]++]![1] as "*" | "/";
    const right = parseFactor(tokens, pos);
    left = op === "*" ? left * right : left / right;
  }
  return left;
}

function parseFactor(tokens: Token[], pos: [number]): number {
  const token = tokens[pos[0]];
  if (token && token[0] === "NUM") {
    pos[0]++;
    return token[1];
  }
  throw new Error(`Unexpected token: ${token}`);
}

export function interpret(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const pos: [number] = [0];
  const result = parseExpr(tokens, pos);
  return result;
}
