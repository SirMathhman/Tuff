type Token = { type: string; value: string };

type Value = { tag: "number"; num: number } | { tag: "bool"; val: boolean };

function num(v: number): Value { return { tag: "number", num: v }; }
function bool(v: boolean): Value { return { tag: "bool", val: v }; }
function toNum(v: Value): number { return v.tag === "number" ? v.num : v.val ? 1 : 0; }
function truthy(v: Value): boolean { return toNum(v) !== 0; }
function eq(a: Value, b: Value): Value {
  if (a.tag !== b.tag) return bool(false);
  if (a.tag === "number") return bool(a.num === (b as Value & { tag: "number" }).num);
  return bool(a.val === (b as Value & { tag: "bool" }).val);
}

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
    if (source[i] === "=" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "==" });
      i += 2;
      continue;
    }
    if (source[i] === "|" && source[i + 1] === "|") {
      tokens.push({ type: "punct", value: "||" });
      i += 2;
      continue;
    }
    if (source[i] === "&" && source[i + 1] === "&") {
      tokens.push({ type: "punct", value: "&&" });
      i += 2;
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
  const scopes: Record<string, Value>[] = [{}];
  const mutables: Record<string, boolean>[] = [{}];
  function lookup(name: string): Value {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i];
      if (s && name in s) return s[name]!;
    }
    throw new Error(`undeclared variable: ${name}`);
  }
  function isMutable(name: string): boolean {
    for (let i = mutables.length - 1; i >= 0; i--) {
      const m = mutables[i];
      if (m && name in m) return m[name]!;
    }
    return false;
  }
  function assign(name: string, value: Value): void {
    scopes[scopes.length - 1]![name] = value;
  }
  function parseExpression(): Value {
    let result = parseOr();
    while (tokens[pos]?.value === "+" || tokens[pos]?.value === "-") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseOr();
      if (op === "+") result = num(toNum(result) + toNum(next));
      else result = num(toNum(result) - toNum(next));
    }
    return result;
  }
  function parseOr(): Value {
    let result = parseAnd();
    while (tokens[pos]?.value === "||") {
      pos++;
      const next = parseAnd();
      result = bool(truthy(result) || truthy(next));
    }
    return result;
  }
  function parseAnd(): Value {
    let result = parseComparison();
    while (tokens[pos]?.value === "&&") {
      pos++;
      const next = parseComparison();
      result = bool(truthy(result) && truthy(next));
    }
    return result;
  }
  function parseComparison(): Value {
    let result = parseTerm();
    while (tokens[pos]?.value === "==") {
      pos++;
      const next = parseTerm();
      result = eq(result, next);
    }
    return result;
  }
  function parseTerm(): Value {
    let result = parseFactor();
    while (tokens[pos]?.value === "*" || tokens[pos]?.value === "/") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseFactor();
      if (op === "*") result = num(toNum(result) * toNum(next));
      else result = num(toNum(result) / toNum(next));
    }
    return result;
  }
  function parseFactor(): Value {
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
    if (tok?.value === "true") {
      pos++;
      return bool(true);
    }
    if (tok?.value === "false") {
      pos++;
      return bool(false);
    }
    if (tok?.type === "identifier") {
      pos++;
      return lookup(tok.value);
    }
    const result = parseFloat(tok!.value);
    pos++;
    return num(result);
  }
  function parseStatement(): Value | null {
    if (tokens[pos]?.value === "let") {
      pos++;
      const mutable = tokens[pos]?.value === "mut";
      if (mutable) pos++;
      const name = tokens[pos]!.value;
      pos++;
      pos++; // skip "="
      assign(name, parseExpression());
      if (mutable) mutables[mutables.length - 1]![name] = true;
      if (tokens[pos]?.value === ";") pos++;
      return null;
    }
    // Check for assignment: identifier = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "=") {
      const name = tokens[pos]!.value;
      if (!isMutable(name)) throw new Error(`cannot assign to immutable variable: ${name}`);
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
  function parseBlock(): Value {
    pos++; // skip "{"
    scopes.push({});
    mutables.push({});
    let value: Value | null = null;
    while (tokens[pos]?.value !== "}" && tokens[pos]) {
      value = parseStatement();
    }
    pos++; // skip "}"
    scopes.pop();
    mutables.pop();
    if (value === null) throw new Error("block has no value");
    return value;
  }
  let value: Value | null = null;
  while (tokens[pos]) {
    value = parseStatement();
  }
  return value ? toNum(value) : 0;
}
