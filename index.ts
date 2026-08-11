export function evaluate(source: string): number {
  if (source === "") return 0;

  const tokens = tokenize(source);
  const parser = { pos: 0 };
  const result = parseAddSub(parser, tokens);

  if (parser.pos < tokens.length) {
    throw new Error("Invalid source: " + source);
  }
  return result;
}

type Token =
  | ["num", number]
  | ["op", "+" | "-" | "*" | "/"]
  | ["paren", "(" | ")"];

function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const re = /(\d+\.?\d*|[+\-*/()])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text] = match;
    if (text === " " || text === "") continue;
    if (text === "+" || text === "-" || text === "*" || text === "/") {
      result.push(["op", text as "+" | "-" | "*" | "/"]);
    } else if (text === "(" || text === ")") {
      result.push(["paren", text as "(" | ")"]);
    } else {
      result.push(["num", Number(text)]);
    }
  }
  return result;
}

function parseAddSub(p: { pos: number }, tokens: Token[]): number {
  let left = parseMulDiv(p, tokens);
  while (
    p.pos < tokens.length &&
    tokens[p.pos]![0] === "op" &&
    (tokens[p.pos]![1] === "+" || tokens[p.pos]![1] === "-")
  ) {
    const op = tokens[p.pos]![1];
    p.pos++;
    const right = parseMulDiv(p, tokens);
    left = op === "+" ? left + right : left - right;
  }
  return left;
}

function parseMulDiv(p: { pos: number }, tokens: Token[]): number {
  let left = parseFactor(p, tokens);
  while (
    p.pos < tokens.length &&
    tokens[p.pos]![0] === "op" &&
    (tokens[p.pos]![1] === "*" || tokens[p.pos]![1] === "/")
  ) {
    const op = tokens[p.pos]![1];
    p.pos++;
    const right = parseFactor(p, tokens);
    left = op === "*" ? left * right : left / right;
  }
  return left;
}

function parseFactor(p: { pos: number }, tokens: Token[]): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Unexpected end");
  if (token[0] === "paren" && token[1] === "(") {
    p.pos++; // consume "("
    const expr = parseAddSub(p, tokens);
    if (tokens[p.pos]![0] !== "paren" || tokens[p.pos]![1] !== ")") {
      throw new Error("Expected )");
    }
    p.pos++; // consume ")"
    return expr;
  }
  return parseNumber(p, tokens);
}

function parseNumber(p: { pos: number }, tokens: Token[]): number {
  const token = tokens[p.pos];
  if (!token || token[0] !== "num") {
    throw new Error("Expected number");
  }
  p.pos++;
  return token[1];
}
