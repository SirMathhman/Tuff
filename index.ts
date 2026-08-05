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
      tokens.push({ type: ident === "let" || ident === "mut" ? "keyword" : "identifier", value: ident });
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
  const mutableVars = new Set<string>();
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
  function parseStatement(): number | null {
    if (tokens[pos]?.value === "let") {
      pos++;
      const mutable = tokens[pos]?.value === "mut";
      if (mutable) pos++;
      const name = tokens[pos]!.value;
      pos++;
      pos++; // skip "="
      assign(name, parseExpression());
      if (mutable) mutableVars.add(name);
      if (tokens[pos]?.value === ";") pos++;
      return null;
    }
    // Check for assignment: identifier = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "=") {
      const name = tokens[pos]!.value;
      pos++; // skip identifier
      pos++; // skip "="
      assign(name, parseExpression());
      if (tokens[pos]?.value === ";") pos++;
      return null;
    }
    const result = parseExpression();
    if (tokens[pos]?.value === ";") pos++;
    return result;
  }
  function parseBlock(): number {
    pos++; // skip "{"
    scopes.push({});
    let value: number | null = null;
    while (tokens[pos]?.value !== "}" && tokens[pos]) {
      value = parseStatement();
    }
    pos++; // skip "}"
    scopes.pop();
    if (value === null) throw new Error("block has no value");
    return value;
  }
  let value: number | null = null;
  while (tokens[pos]) {
    value = parseStatement();
  }
  return value ?? 0;
}
