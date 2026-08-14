import { tokenize } from "./tokenizer";

function formatError(input: string, pos: number, message: string): string {
  const start = Math.max(0, pos - 10);
  const end = Math.min(input.length, pos + 10);
  const snippet = input.slice(start, end);
  const caretPos = pos - start;
  const prefix = start > 0 ? "..." : "";
  const suffix = end < input.length ? "..." : "";
  return `${message}\n  ${prefix}"${snippet}"${suffix}\n  ${" ".repeat(caretPos)}^`;
}

export function interpret(input: string): number {
  if (input === "") return 0;

  const tokens = tokenize(input);

  let pos = 0;
  const scope = new Map<string, number>();

  function parseExpr(): number {
    let result = parseTerm();
    while (
      pos < tokens.length &&
      (tokens[pos] === "+" || tokens[pos] === "-")
    ) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (
      pos < tokens.length &&
      (tokens[pos] === "*" || tokens[pos] === "/")
    ) {
      const op = tokens[pos++];
      const right = parseFactor();
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseNumber(token: string): number {
    const value = Number(token);
    if (Number.isNaN(value)) {
      const idx = input.indexOf(token);
      throw new Error(
        formatError(
          input,
          idx,
          `Invalid number: "${token}" — did you mean to use a numeric literal?`,
        ),
      );
    }
    return value;
  }

  function parseBlock(): number {
    let result = 0;
    while (pos < tokens.length && tokens[pos] !== "}") {
      if (tokens[pos] === "let") {
        pos++;
        const name = tokens[pos++]!;
        if (tokens[pos] === "=") pos++;
        result = parseExpr();
        scope.set(name, result);
        if (tokens[pos] === ";") pos++;
      } else {
        result = parseExpr();
        if (tokens[pos] === ";") pos++;
      }
    }
    if (tokens[pos] === "}") pos++;
    return result;
  }

  function parseFactor(): number {
    const token = tokens[pos];
    if (token === "(") {
      pos++;
      const result = parseExpr();
      if (tokens[pos] !== ")") {
        const idx = input.indexOf(tokens[pos] || "");
        throw new Error(
          formatError(
            input,
            idx,
            `Expected closing bracket ")" but found "${tokens[pos] || "end of input"}" — add a ")" to close the expression`,
          ),
        );
      }
      pos++;
      return result;
    }
    if (token === "{") {
      pos++;
      return parseBlock();
    }
    if (token !== undefined && /[a-zA-Z_]\w*/.test(token) && token !== "let") {
      pos++;
      if (scope.has(token)) return scope.get(token)!;
      return parseNumber(token);
    }
    return parseNumber(tokens[pos++]!);
  }

  function parseProgram(): number {
    let result = 0;
    while (pos < tokens.length) {
      if (tokens[pos] === "let") {
        pos++;
        const name = tokens[pos++]!;
        if (tokens[pos] === "=") pos++;
        result = parseExpr();
        scope.set(name, result);
        if (tokens[pos] === ";") pos++;
      } else {
        result = parseExpr();
        if (tokens[pos] === ";") pos++;
      }
    }
    return result;
  }

  return parseProgram();
}
