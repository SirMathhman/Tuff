type Token =
  | { type: "Number"; value: string }
  | { type: "Identifier"; value: string }
  | { type: "Plus" }
  | { type: "Minus" }
  | { type: "Star" }
  | { type: "Slash" }
  | { type: "Assign" }
  | { type: "Semi" }
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
    } else if (/[a-zA-Z_]/.test(src[i]!)) {
      let start = i;
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i]!)) i++;
      const word = src.slice(start, i);
      if (word === "let") {
        tokens.push({ type: "Identifier", value: "let" });
      } else {
        tokens.push({ type: "Identifier", value: word });
      }
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
    } else if (src[i] === "=") {
      tokens.push({ type: "Assign" });
      i++;
    } else if (src[i] === ";") {
      tokens.push({ type: "Semi" });
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

function expectSemi(tokens: Token[]): void {
  const semiToken = tokens.shift();
  if (semiToken?.type !== "Semi")
    throw new Error(`Expected ';', got ${semiToken?.type ?? "nothing"}`);
}

function parseStatementsInScope(
  tokens: Token[],
  stopType: string,
): string {
  const parts: string[] = [];
  let hasDeclarations = false;
  let lastExpr: string | null = null;
  while (tokens[0]?.type !== stopType && tokens[0]?.type !== "Eof") {
    if (tokens[0]?.type === "Identifier" && tokens[0]?.value === "let") {
      hasDeclarations = true;
      tokens.shift();
      // Check for 'mut' keyword
      const nextToken = tokens[0];
      const isMut = nextToken?.type === "Identifier" && nextToken.value === "mut";
      if (isMut) tokens.shift();
      const nameToken = tokens.shift();
      if (nameToken?.type !== "Identifier")
        throw new Error(
          `Expected variable name, got ${nameToken?.type ?? "nothing"}`,
        );
      const name = nameToken.value;
      const assignToken = tokens.shift();
      if (assignToken?.type !== "Assign")
        throw new Error(`Expected '=', got ${assignToken?.type ?? "nothing"}`);
      const value = parseExpression(tokens);
      expectSemi(tokens);
      parts.push(`var ${name} = ${value};`);
      lastExpr = null;
    } else if (
      tokens[0]?.type === "Identifier" &&
      tokens[1]?.type === "Assign"
    ) {
      // Assignment statement (e.g., x = 1;)
      const nameToken = tokens.shift() as { type: "Identifier"; value: string };
      const name = nameToken.value;
      tokens.shift(); // consume '='
      const value = parseExpression(tokens);
      expectSemi(tokens);
      parts.push(`${name} = ${value};`);
      lastExpr = null;
    } else {
      const expr = parseExpression(tokens);
      const semiToken = tokens.shift();
      if (semiToken?.type === "Semi") {
        parts.push(expr + ";");
        lastExpr = null;
      } else {
        lastExpr = expr;
        if (semiToken) tokens.unshift(semiToken);
      }
    }
  }
  if (parts.length === 0 && lastExpr === null) return "0";
  if (lastExpr) {
    if (hasDeclarations) {
      return `(function() { ${parts.join("\n")}return ${lastExpr}; })()`;
    }
    return `(${lastExpr})`;
  }
  if (hasDeclarations) {
    return `(function() { ${parts.join("\n")} })()`;
  }
  return `(${parts.join("\n")})`;
}

function parseBlock(tokens: Token[]): string {
  return parseStatementsInScope(tokens, "RBrace");
}

function expectClosing(tokens: Token[], closeType: string, expected: string): void {
  const closing = tokens.shift();
  if (closing?.type !== closeType)
    throw new Error(`Expected '${expected}', got ${closing?.type ?? "nothing"}`);
}

function parseGrouped(
  tokens: Token[],
  closeType: string,
  expected: string,
): string {
  const result = closeType === "RBrace"
    ? parseBlock(tokens)
    : parseExpression(tokens);
  expectClosing(tokens, closeType, expected);
  return `(${result})`;
}

function parsePrimary(tokens: Token[]): string {
  const token = tokens.shift();
  if (token?.type === "Number") return token.value;
  if (token?.type === "Identifier" && token.value !== "let") return token.value;
  if (token?.type === "LParen") return parseGrouped(tokens, "RParen", ")");
  if (token?.type === "LBrace") return parseGrouped(tokens, "RBrace", "}");
  if (token?.type === "Eof") return "0";
  throw new Error(`Expected number or '(', got ${token?.type ?? "nothing"}`);
}

function parseStatements(tokens: Token[]): string {
  return parseStatementsInScope(tokens, "Eof");
}

const PRELUDE = "in let args : &[&Str]; ";

export function compileTuffToJS(tuffSource: string): string {
  const source = tuffSource.startsWith(PRELUDE)
    ? tuffSource.slice(PRELUDE.length)
    : tuffSource;
  const tokens = tokenize(source);
  const result = parseStatements(tokens);
  return `return ${result};`;
}
