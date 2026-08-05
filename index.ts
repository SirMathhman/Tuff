type Token = { type: string; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i]!)) { i++; continue; }
    if (/[0-9.]/.test(source[i]!)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) { num += source[i]!; i++; }
      tokens.push({ type: "number", value: num });
      continue;
    }
    if (/[a-zA-Z_]/.test(source[i]!)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z_0-9]/.test(source[i]!)) { ident += source[i]!; i++; }
      tokens.push({ type: ident === "let" ? "keyword" : "identifier", value: ident });
      continue;
    }
    tokens.push({ type: "punct", value: source[i]! });
    i++;
  }
  return tokens;
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = tokenize(trimmed);
  let pos = 0;
  const scopes: Record<string, number>[] = [{}];
  function lookup(name: string): number {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i];
      if (s && name in s) return s[name]!;
    }
    throw new Error(`undeclared variable: ${name}`);
  }
  function assign(name: string, value: number): void {
    scopes[scopes.length - 1]![name] = value;
  }
  function parseExpression(): number {
    let result = parseTerm();
    while (tokens[pos]?.value === "+" || tokens[pos]?.value === "-") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseTerm();
      if (op === "+") result += next;
      else result -= next;
    }
    return result;
  }
  function parseTerm(): number {
    let result = parseFactor();
    while (tokens[pos]?.value === "*" || tokens[pos]?.value === "/") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseFactor();
      if (op === "*") result *= next;
      else result /= next;
    }
    return result;
  }
  function parseFactor(): number {
    const tok = tokens[pos];
    if (tok?.value === "(") {
      pos++;
      const result = parseExpression();
      pos++; // skip ")"
      return result;
    }
    if (tok?.value === "{") {
      return parseBlock();
    }
    if (tok?.type === "identifier") {
      pos++;
      return lookup(tok.value);
    }
    const result = parseFloat(tok!.value);
    pos++;
    return result;
  }
  function parseStatements(stopToken: string): number | null {
    let result: number | null = null;
    while (tokens[pos]?.value !== stopToken && tokens[pos]) {
      if (tokens[pos]?.value === "let") {
        pos++; // skip "let"
        const name = tokens[pos]!.value;
        pos++; // skip identifier
        pos++; // skip "="
        assign(name, parseExpression());
        if (tokens[pos]?.value === ";") pos++;
      } else {
        result = parseExpression();
        if (tokens[pos]?.value === ";") pos++;
      }
    }
    if (stopToken && tokens[pos]?.value === stopToken) pos++;
    return result;
  }
  function parseBlock(): number {
    pos++; // skip "{"
    scopes.push({});
    const result = parseStatements("}");
    scopes.pop();
    if (result === null) throw new Error("block has no value");
    return result;
  }
  const r = parseStatements("");
  return r ?? 0;
}
