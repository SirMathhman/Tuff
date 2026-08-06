type Token = { type: string; value: string; suffix?: string };

type Value =
  | { tag: "number"; num: number; type?: string }
  | { tag: "bool"; val: boolean }
  | {
      tag: "fn";
      params: string[];
      body: Ast;
      scopes: Scope[];
      mutables: Scope["mutable"][];
    }
  | { tag: "ref"; scope: Scope; name: string; mutable: boolean }
  | { tag: "tuple"; values: Value[] }
  | { tag: "null" }
  | { tag: "array"; values: Value[] }
  | { tag: "string"; value: string }
  | { tag: "record"; fields: Record<string, Value> };

function num(v: number, type?: string): Value {
  return { tag: "number", num: v, type };
}
function bool(v: boolean): Value {
  return { tag: "bool", val: v };
}
function toNum(v: Value): number {
  switch (v.tag) {
    case "number":
      return v.num;
    case "bool":
      return v.val ? 1 : 0;
    case "ref":
      return toNum(v.scope.vars[v.name]!);
    case "tuple":
      return 0;
    case "null":
      return 0;
    case "array":
      return 0;
    case "string":
      return v.value.charCodeAt(0);
    case "record":
      return 0;
    default:
      throw new Error(`cannot convert ${v.tag} to number`);
  }
}
function truthy(v: Value): boolean {
  return toNum(v) !== 0;
}
function eqValues(a: Value[], b: Value[]): boolean {
  return a.length === b.length && a.every((v, i) => truthy(eq(v, b[i]!)));
}
function eq(a: Value, b: Value): Value {
  if (a.tag !== b.tag) return bool(false);
  switch (a.tag) {
    case "number":
      return bool(a.num === (b as Extract<Value, { tag: "number" }>).num);
    case "bool":
      return bool(a.val === (b as Extract<Value, { tag: "bool" }>).val);
    case "string":
      return bool(a.value === (b as Extract<Value, { tag: "string" }>).value);
    case "array":
      return bool(eqValues(a.values, (b as Extract<Value, { tag: "array" }>).values));
    case "tuple":
      return bool(eqValues(a.values, (b as Extract<Value, { tag: "tuple" }>).values));
    default:
      return bool(false);
  }
}
function ne(a: Value, b: Value): Value {
  return bool(!truthy(eq(a, b)));
}
function cmp(a: Value, b: Value): number {
  if (a.tag === "string" && b.tag === "string") {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }
  return toNum(a) - toNum(b);
}
function lt(a: Value, b: Value): Value {
  return bool(cmp(a, b) < 0);
}
function lte(a: Value, b: Value): Value {
  return bool(cmp(a, b) <= 0);
}
function gt(a: Value, b: Value): Value {
  return bool(cmp(a, b) > 0);
}
function gte(a: Value, b: Value): Value {
  return bool(cmp(a, b) >= 0);
}
function notOp(v: Value): Value {
  return bool(!truthy(v));
}

type ControlFlow =
  | { kind: "continue" }
  | { kind: "break" }
  | { kind: "yield"; value: Value }
  | { kind: "return"; value: Value };

function isControlFlow(e: unknown): e is ControlFlow {
  return typeof e === "object" && e !== null && "kind" in e;
}

// AST types
type Ast =
  | { kind: "num"; value: number; suffix?: string }
  | { kind: "bool"; value: boolean }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "!" | "-" | "&" | "&mut" | "*"; operand: Ast }
  | { kind: "tuple"; elements: Ast[] }
  | { kind: "index"; target: Ast; index: number }
  | { kind: "binop"; op: string; left: Ast; right: Ast }
  | { kind: "let"; mutable: boolean; name: string; value: Ast; typeAnnotation?: string }
  | { kind: "assign"; name: string; value: Ast }
  | { kind: "refassign"; name: string; value: Ast }
  | { kind: "array_assign"; target: Ast; index: Ast; value: Ast }
  | { kind: "block"; statements: (Ast | null)[] }
  | { kind: "paren"; expr: Ast }
  | { kind: "if_expr"; cond: Ast; thenBranch: Ast; elseBranch: Ast }
  | { kind: "if_stmt"; cond: Ast; thenBranch: Ast; elseBranch: Ast | null }
  | { kind: "augassign"; name: string; op: "+" | "-"; value: Ast }
  | { kind: "while"; cond: Ast; body: Ast }
  | { kind: "for"; varName: string; start: Ast; end: Ast; body: Ast }
  | { kind: "continue" }
  | { kind: "break" }
  | { kind: "yield"; value: Ast }
  | { kind: "return"; value: Ast }
  | { kind: "fn"; name: string; params: string[]; body: Ast }
  | { kind: "call"; name: string; args: Ast[]; target?: Ast }
  | { kind: "match"; expr: Ast; cases: { pattern: Ast; body: Ast }[] }
  | { kind: "wildcard" }
  | { kind: "null" }
  | { kind: "array"; elements: Ast[] }
  | { kind: "array_index"; target: Ast; index: Ast }
  | { kind: "char"; value: string }
  | { kind: "string"; value: string }
  | { kind: "string_index"; target: Ast; index: Ast }
  | { kind: "length"; target: Ast }
  | { kind: "property_access"; target: Ast; property: string }
  | { kind: "record"; fields: { key: string; value: Ast }[] }
  | { kind: "typecheck"; value: Ast; type: string }
  | { kind: "typealias"; name: string; baseType: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i]!)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(source[i]!)) {
      let numStr = "";
      while (i < source.length && /[0-9]/.test(source[i]!)) {
        numStr += source[i]!;
        i++;
      }
      // Handle decimal point
      if (
        i < source.length &&
        source[i] === "." &&
        i + 1 < source.length &&
        /[0-9]/.test(source[i + 1]!)
      ) {
        numStr += source[i]!;
        i++;
        while (i < source.length && /[0-9]/.test(source[i]!)) {
          numStr += source[i]!;
          i++;
        }
      }
      // Handle numeric suffixes (e.g., U8, I32, F64)
      let suffix: string | undefined;
      if (i < source.length && /[a-zA-Z]/.test(source[i]!)) {
        const suffixStart = i;
        while (i < source.length && /[a-zA-Z0-9]/.test(source[i]!)) {
          i++;
        }
        suffix = source.slice(suffixStart, i);
      }
      tokens.push({ type: "number", value: numStr, suffix });
      continue;
    }
    if (source[i] === ".") {
      if (source[i + 1] === ".") {
        tokens.push({ type: "punct", value: ".." });
        i += 2;
        continue;
      }
      tokens.push({ type: "punct", value: "." });
      i++;
      continue;
    }
    if (source[i] === "'") {
      i++; // skip opening quote
      let ch = "";
      while (i < source.length && source[i] !== "'") {
        if (source[i] === "\\") {
          i++; // skip backslash
          if (source[i] === "n") ch = "\n";
          else if (source[i] === "t") ch = "\t";
          else if (source[i] === "\\") ch = "\\";
          else if (source[i] === "'") ch = "'";
          else ch = source[i] || "";
        } else {
          ch += source[i]!;
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: "char", value: ch });
      continue;
    }
    if (source[i] === '"') {
      i++; // skip opening quote
      let str = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") {
          i++; // skip backslash
          if (source[i] === "n") str += "\n";
          else if (source[i] === "t") str += "\t";
          else if (source[i] === "\\") str += "\\";
          else if (source[i] === '"') str += '"';
          else str += source[i] || "";
        } else {
          str += source[i]!;
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }
    if (/[a-zA-Z_]/.test(source[i]!)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z_0-9]/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      tokens.push({
        type:
          ident === "let" ||
          ident === "mut" ||
          ident === "if" ||
          ident === "else" ||
          ident === "while" ||
          ident === "for" ||
          ident === "in" ||
          ident === "continue" ||
          ident === "break" ||
          ident === "yield" ||
          ident === "return" ||
          ident === "fn" ||
          ident === "match" ||
          ident === "case" ||
          ident === "null" ||
          ident === "is" ||
          ident === "type"
            ? "keyword"
            : "identifier",
        value: ident,
      });
      continue;
    }
    if (source[i] === ":") {
      tokens.push({ type: "punct", value: ":" });
      i++;
      continue;
    }
    if (source[i] === "<" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "<=" });
      i += 2;
      continue;
    }
    if (source[i] === ">" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: ">=" });
      i += 2;
      continue;
    }
    if (source[i] === "=" && source[i + 1] === ">") {
      tokens.push({ type: "punct", value: "=>" });
      i += 2;
      continue;
    }
    if (source[i] === "!" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "!=" });
      i += 2;
      continue;
    }
    if (source[i] === "+" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "+=" });
      i += 2;
      continue;
    }
    if (source[i] === "-" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "-=" });
      i += 2;
      continue;
    }
    if (source[i] === "=" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "==" });
      i += 2;
      continue;
    }
    if (source[i] === "<") {
      tokens.push({ type: "punct", value: "<" });
      i++;
      continue;
    }
    if (source[i] === ">") {
      tokens.push({ type: "punct", value: ">" });
      i++;
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

// Parser — returns AST, does not evaluate
function parse(tokens: Token[]): Ast {
  let pos = 0;
  function expectToken(value: string): void {
    const tok = tokens[pos];
    if (!tok || tok.value !== value)
      throw new Error(`expected "${value}", got "${tok?.value ?? "EOF"}"`);
    pos++;
  }
  function parseExpression(): Ast {
    let result = parseOr();
    while (tokens[pos]?.value === "+" || tokens[pos]?.value === "-") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseOr();
      result = { kind: "binop", op, left: result, right: next };
    }
    return result;
  }
  function parseOr(): Ast {
    let result = parseAnd();
    while (tokens[pos]?.value === "||") {
      pos++;
      const next = parseAnd();
      result = { kind: "binop", op: "||", left: result, right: next };
    }
    return result;
  }
  function parseAnd(): Ast {
    let result = parseComparison();
    while (tokens[pos]?.value === "&&") {
      pos++;
      const next = parseComparison();
      result = { kind: "binop", op: "&&", left: result, right: next };
    }
    return result;
  }
  function parseComparison(): Ast {
    let result = parseTerm();
    while (true) {
      const op = tokens[pos]?.value;
      if (
        op === "==" ||
        op === "!=" ||
        op === "<" ||
        op === "<=" ||
        op === ">" ||
        op === ">="
      ) {
        pos++;
        const next = parseTerm();
        result = { kind: "binop", op, left: result, right: next };
      } else if (op === "is") {
        pos++;
        const typeName = tokens[pos]!.value;
        pos++;
        result = { kind: "typecheck", value: result, type: typeName };
      } else {
        break;
      }
    }
    return result;
  }
  function parseTerm(): Ast {
    let result = parseFactor();
    while (tokens[pos]?.value === "*" || tokens[pos]?.value === "/" || tokens[pos]?.value === "%") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseFactor();
      result = { kind: "binop", op, left: result, right: next };
    }
    return result;
  }
  function parseFactor(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "!") {
      pos++;
      return { kind: "unary", op: "!", operand: parseFactor() };
    }
    if (tok?.value === "-") {
      pos++;
      return { kind: "unary", op: "-", operand: parseFactor() };
    }
    if (tok?.value === "&") {
      pos++;
      if (tokens[pos]?.value === "mut") {
        pos++;
        return { kind: "unary", op: "&mut", operand: parseFactor() };
      }
      return { kind: "unary", op: "&", operand: parseFactor() };
    }
    if (tok?.value === "*") {
      pos++;
      return { kind: "unary", op: "*", operand: parseFactor() };
    }
    return parsePrimary();
  }
  function parsePrimary(): Ast {
    let result = parseAtom();
    // Postfix loop — handle chained indexing, field access, calls, etc.
    while (true) {
      if (tokens[pos]?.value === "[") {
        pos++; // skip "["
        const index = parseExpression();
        pos++; // skip "]"
        if (result.kind === "string") {
          result = { kind: "string_index", target: result, index };
        } else {
          result = { kind: "array_index", target: result, index };
        }
      } else if (tokens[pos]?.value === ".") {
        pos++; // skip "."
        const nextTok = tokens[pos];
        if (nextTok?.type === "number") {
          pos++;
          result = {
            kind: "index",
            target: result,
            index: parseInt(nextTok.value),
          };
        } else if (nextTok?.value === "length") {
          pos++;
          result = { kind: "length", target: result };
        } else {
          const property = nextTok!.value;
          pos++;
          result = { kind: "property_access", target: result, property };
        }
      } else if (tokens[pos]?.value === "(") {
        pos++; // skip "("
        const args: Ast[] = [];
        while (tokens[pos]?.value !== ")") {
          args.push(parseExpression());
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip ")"
        result = { kind: "call", name: "", target: result, args };
      } else {
        break;
      }
    }
    return result;
  }
  function parseAtom(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "(") {
      pos++;
      // Check if this is a tuple (contains commas) or a parenthesized expression
      // Look ahead to see if there's a comma before the closing paren
      let depth = 1;
      let j = pos;
      let hasComma = false;
      while (depth > 0 && tokens[j]) {
        if (tokens[j]!.value === "(") depth++;
        else if (tokens[j]!.value === ")") depth--;
        else if (tokens[j]!.value === "," && depth === 1) hasComma = true;
        j++;
      }
      if (hasComma) {
        // Parse as tuple
        const elements: Ast[] = [];
        while (tokens[pos]?.value !== ")") {
          elements.push(parseExpression());
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip ")"
        return { kind: "tuple", elements };
      }
      const result = parseExpression();
      pos++; // skip ")"
      return { kind: "paren", expr: result };
    }
    if (tok?.value === "{") {
      // Check if this is a record literal: { key : value, ... }
      // Look ahead to see if the next token is an identifier followed by ":"
      if (
        tokens[pos + 1]?.type === "identifier" &&
        tokens[pos + 2]?.value === ":"
      ) {
        pos++; // skip "{"
        const fields: { key: string; value: Ast }[] = [];
        while (tokens[pos]?.value !== "}") {
          const key = tokens[pos]!.value;
          pos++; // skip key
          pos++; // skip ":"
          const value = parseExpression();
          fields.push({ key, value });
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip "}"
        return { kind: "record", fields };
      }
      return parseBlock();
    }
    if (tok?.value === "[") {
      pos++; // skip "["
      const elements: Ast[] = [];
      while (tokens[pos]?.value !== "]") {
        elements.push(parseExpression());
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip "]"
      return { kind: "array", elements };
    }
    if (tok?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseExpression();
      expectToken("else");
      const elseBranch = parseExpression();
      return { kind: "if_expr", cond, thenBranch, elseBranch };
    }
    if (tok?.value === "match") {
      pos++; // skip "match"
      expectToken("(");
      const expr = parseExpression();
      expectToken(")");
      expectToken("{");
      const cases: { pattern: Ast; body: Ast }[] = [];
      while (tokens[pos]?.value !== "}") {
        expectToken("case");
        const pattern =
          tokens[pos]?.value === "_"
            ? (pos++, { kind: "wildcard" } as Ast)
            : parseExpression();
        expectToken("=>");
        const body = parseExpression();
        cases.push({ pattern, body });
        if (tokens[pos]?.value === ";") pos++;
      }
      pos++; // skip "}"
      return { kind: "match", expr, cases };
    }
    if (tok?.value === "true") {
      pos++;
      return { kind: "bool", value: true };
    }
    if (tok?.value === "false") {
      pos++;
      return { kind: "bool", value: false };
    }
    if (tok?.value === "null") {
      pos++;
      return { kind: "null" };
    }
    if (tok?.type === "char") {
      pos++;
      return { kind: "char", value: tok.value };
    }
    if (tok?.type === "string") {
      pos++;
      return { kind: "string", value: tok.value };
    }
    if (tok?.type === "identifier") {
      const name = tok.value;
      pos++;
      return { kind: "ident", name };
    }
    const result = parseFloat(tok!.value);
    pos++;
    return { kind: "num", value: result, suffix: tok?.suffix };
  }
  function parseStatement(): Ast | null {
    // Check for type alias: type Alias = BaseType
    if (tokens[pos]?.value === "type") {
      pos++; // skip "type"
      const name = tokens[pos]!.value;
      pos++; // skip alias name
      pos++; // skip "="
      const baseType = tokens[pos]!.value;
      pos++; // skip base type
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "typealias", name, baseType };
    }
    if (tokens[pos]?.value === "let") {
      pos++;
      const mutable = tokens[pos]?.value === "mut";
      if (mutable) pos++;
      const name = tokens[pos]!.value;
      pos++;
      // Check for type annotation: let x : Type = value
      let typeAnnotation: string | undefined;
      if (tokens[pos]?.value === ":") {
        pos++; // skip ":"
        typeAnnotation = tokens[pos]!.value;
        pos++; // skip type
      }
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "let", mutable, name, value, typeAnnotation };
    }
    // Check for augmented assignment: identifier += expression or identifier -= expression
    if (tokens[pos]?.type === "identifier" && (tokens[pos + 1]?.value === "+=" || tokens[pos + 1]?.value === "-=")) {
      const name = tokens[pos]!.value;
      const op = tokens[pos + 1]!.value === "+=" ? "+" : "-";
      pos++; // skip identifier
      pos++; // skip "+=" or "-="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "augassign", name, op, value };
    }
    // Check for dereference assignment: *identifier = expression
    if (
      tokens[pos]?.value === "*" &&
      tokens[pos + 1]?.type === "identifier" &&
      tokens[pos + 2]?.value === "="
    ) {
      const name = tokens[pos + 1]!.value;
      pos++; // skip "*"
      pos++; // skip identifier
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "refassign", name, value };
    }
    // Check for array indexed assignment: identifier[expr] = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "[") {
      // Look ahead to see if there's an = after the ]
      let depth = 0;
      let j = pos + 2;
      let foundEquals = false;
      while (tokens[j]) {
        if (tokens[j]!.value === "[") depth++;
        else if (tokens[j]!.value === "]") {
          if (depth === 0) {
            if (tokens[j + 1]?.value === "=") foundEquals = true;
            break;
          }
          depth--;
        }
        j++;
      }
      if (foundEquals) {
        const name = tokens[pos]!.value;
        pos++; // skip identifier
        pos++; // skip "["
        const index = parseExpression();
        if (tokens[pos]?.value === "]") pos++; // skip "]"
        if (tokens[pos]?.value === "=") pos++; // skip "="
        const value = parseExpression();
        if (tokens[pos]?.value === ";") pos++;
        return {
          kind: "array_assign",
          target: { kind: "ident", name },
          index,
          value,
        };
      }
    }
    // Check for assignment: identifier = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "=") {
      const name = tokens[pos]!.value;
      pos++; // skip identifier
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "assign", name, value };
    }
    // Check for continue statement
    if (tokens[pos]?.value === "continue") {
      pos++;
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "continue" };
    }
    // Check for break statement
    if (tokens[pos]?.value === "break") {
      pos++;
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "break" };
    }
    // Check for return statement
    if (tokens[pos]?.value === "return") {
      pos++;
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "return", value };
    }
    // Check for yield statement
    if (tokens[pos]?.value === "yield") {
      pos++;
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "yield", value };
    }
    // Check for fn statement
    if (tokens[pos]?.value === "fn") {
      pos++; // skip "fn"
      const name = tokens[pos]!.value;
      pos++; // skip name
      pos++; // skip "("
      const params: string[] = [];
      while (tokens[pos]?.value !== ")") {
        params.push(tokens[pos]!.value);
        pos++;
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip ")"
      pos++; // skip "=>"
      const body = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "fn", name, params, body };
    }
    // Check for while statement
    if (tokens[pos]?.value === "while") {
      pos++; // skip "while"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const body = parseStatement()!;
      return { kind: "while", cond, body };
    }
    // Check for for statement
    if (tokens[pos]?.value === "for") {
      pos++; // skip "for"
      expectToken("(");
      const varName = tokens[pos]!.value;
      pos++; // skip variable name
      expectToken("in");
      const start = parseExpression();
      expectToken("..");
      const end = parseExpression();
      expectToken(")");
      const body = parseStatement()!;
      return { kind: "for", varName, start, end, body };
    }
    // Check for if statement — branches are parsed as statements (fall back to expressions)
    if (tokens[pos]?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseStatement()!;
      const elseBranch =
        tokens[pos]?.value === "else" ? (pos++, parseStatement()) : null;
      return { kind: "if_stmt", cond, thenBranch, elseBranch };
    }
    const result = parseExpression();
    if (tokens[pos]?.value === ";") pos++;
    return result;
  }
  function parseBlock(): Ast {
    pos++; // skip "{"
    const statements: (Ast | null)[] = [];
    while (tokens[pos]?.value !== "}" && tokens[pos]) {
      statements.push(parseStatement());
    }
    pos++; // skip "}"
    return { kind: "block", statements };
  }
  const statements: (Ast | null)[] = [];
  while (tokens[pos]) {
    statements.push(parseStatement());
  }
  if (statements.length === 0) return { kind: "num", value: 0 };
  if (statements.length === 1)
    return statements[0]! ?? { kind: "num", value: 0 };
  return { kind: "block", statements };
}

// Evaluator — walks AST with scope
type Scope = { vars: Record<string, Value>; mutable: Record<string, boolean> };

function evalAst(
  ast: Ast,
  scopes: Scope[],
  mutables: Scope["mutable"][],
): Value {
  function lookup(name: string): Value {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) return scopes[i]!.vars[name]!;
    }
    throw new Error(`undeclared variable: ${name}`);
  }
  function isMutable(name: string): boolean {
    for (let i = mutables.length - 1; i >= 0; i--) {
      if (name in mutables[i]!) return mutables[i]![name]!;
    }
    return false;
  }
  function setVar(name: string, value: Value): void {
    if (!isMutable(name))
      throw new Error(`cannot assign to immutable variable: ${name}`);
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) {
        scopes[i]!.vars[name] = value;
        return;
      }
    }
  }
  const suffixRanges: Record<string, [number, number]> = {
    U8: [0, 255],
    I8: [-128, 127],
    U16: [0, 65535],
    I16: [-32768, 32767],
    U32: [0, 4294967295],
    I32: [-2147483648, 2147483647],
  };

  function checkSuffix(suffix: string, value: number): void {
    const range = suffixRanges[suffix];
    if (range && (value < range[0] || value > range[1])) {
      throw new Error(`${suffix} overflow: ${value}`);
    }
  }

  // Type alias resolution
  const typeAliases: Record<string, string> = {};

  function resolveType(typeName: string): string {
    const seen = new Set<string>();
    let current = typeName;
    while (typeAliases[current] !== undefined) {
      if (seen.has(current)) {
        throw new Error(`circular type alias: ${current}`);
      }
      seen.add(current);
      current = typeAliases[current]!;
    }
    return current;
  }

  function visit(node: Ast): Value | null {
    switch (node.kind) {
      case "num": {
        if (node.suffix) checkSuffix(node.suffix, node.value);
        return num(node.value, node.suffix);
      }
      case "bool":
        return bool(node.value);
      case "ident":
        return lookup(node.name);
      case "unary": {
        const v = visit(node.operand)!;
        if (node.op === "!") return notOp(v);
        if (node.op === "-") {
          const negated = -toNum(v);
          // If operand is a suffixed literal, validate the negated value
          if (node.operand.kind === "num" && node.operand.suffix) {
            checkSuffix(node.operand.suffix, negated);
          }
          return num(negated, v.tag === "number" ? v.type : undefined);
        }
        if (node.op === "&") {
          // Create a reference to the operand
          if (node.operand.kind === "ident") {
            const scope = scopes[scopes.length - 1]!;
            return {
              tag: "ref",
              scope,
              name: node.operand.name,
              mutable: false,
            };
          }
          throw new Error("can only take reference of identifier");
        }
        if (node.op === "&mut") {
          // Create a mutable reference to the operand
          if (node.operand.kind === "ident") {
            const scope = scopes[scopes.length - 1]!;
            return {
              tag: "ref",
              scope,
              name: node.operand.name,
              mutable: true,
            };
          }
          throw new Error("can only take reference of identifier");
        }
        if (node.op === "*") {
          // Dereference
          if (v.tag === "ref") return v.scope.vars[v.name]!;
          throw new Error("cannot dereference non-reference");
        }
        return v;
      }
      case "binop": {
        const l = visit(node.left)!;
        const r = visit(node.right)!;
        return applyBinOp(node.op, l, r);
      }
      case "let": {
        let v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        if (node.typeAnnotation) {
          const resolvedAnn = resolveType(node.typeAnnotation);
          if (suffixRanges[resolvedAnn]) {
            checkSuffix(resolvedAnn, toNum(v));
            // Check type compatibility using the value's tracked type
            if (v.tag === "number" && v.type && suffixRanges[resolveType(v.type)]) {
              const valRange = suffixRanges[resolveType(v.type)]!;
              const annRange = suffixRanges[resolvedAnn]!;
              if (valRange[0] < annRange[0] || valRange[1] > annRange[1]) {
                throw new Error(`cannot assign ${v.type} to ${node.typeAnnotation}`);
              }
            }
          }
          // Propagate type annotation to the stored value
          if (v.tag === "number") {
            v = num(v.num, node.typeAnnotation);
          }
        }
        scopes[scopes.length - 1]!.vars[node.name] = v;
        if (node.mutable) mutables[mutables.length - 1]![node.name] = true;
        return null;
      }
      case "assign": {
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        setVar(node.name, v);
        return null;
      }
      case "array_assign": {
        const target = visit(node.target);
        if (target === null)
          throw new Error("array assign target has no value");
        if (target.tag !== "array")
          throw new Error("cannot assign to non-array");
        const idx = toNum(visit(node.index)!);
        const v = visit(node.value);
        if (v === null) throw new Error("array assign value has no value");
        target.values[idx] = v;
        return null;
      }
      case "refassign": {
        const ref = lookup(node.name);
        if (ref.tag !== "ref") throw new Error("not a reference");
        if (!ref.mutable)
          throw new Error("cannot assign through immutable reference");
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        ref.scope.vars[ref.name] = v;
        return null;
      }
      case "augassign": {
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        const existing = lookup(node.name);
        setVar(node.name, applyBinOp(node.op, existing, v));
        return null;
      }
      case "block": {
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        let value: Value | null = null;
        try {
          for (const stmt of node.statements) {
            if (stmt) value = visit(stmt);
          }
        } catch (e) {
          if (isControlFlow(e) && e.kind === "yield") {
            scopes.pop();
            mutables.pop();
            return e.value;
          }
          throw e;
        }
        scopes.pop();
        mutables.pop();
        return value;
      }
      case "paren":
        return visit(node.expr);
      case "if_expr": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return visit(node.elseBranch);
      }
      case "if_stmt": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return node.elseBranch ? visit(node.elseBranch) : num(0);
      }
      case "while": {
        let iterations = 0;
        while (true) {
          if (iterations++ > 10000) throw new Error("infinite loop detected");
          try {
            if (!truthy(visit(node.cond)!)) break;
            visit(node.body);
          } catch (e) {
            if (isControlFlow(e)) {
              if (e.kind === "continue") continue;
              if (e.kind === "break") break;
            }
            throw e;
          }
        }
        return null;
      }
      case "for": {
        const startVal = toNum(visit(node.start)!);
        const endVal = toNum(visit(node.end)!);
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        scopes[scopes.length - 1]!.vars[node.varName] = num(0);
        mutables[mutables.length - 1]![node.varName] = true;
        let iterations = 0;
        try {
          for (let i = startVal; i < endVal; i++) {
            if (iterations++ > 10000) throw new Error("infinite loop detected");
            scopes[scopes.length - 1]!.vars[node.varName] = num(i);
            try {
              visit(node.body);
            } catch (e) {
              if (isControlFlow(e)) {
                if (e.kind === "continue") continue;
                if (e.kind === "break") break;
              }
              throw e;
            }
          }
        } finally {
          scopes.pop();
          mutables.pop();
        }
        return null;
      }
      case "continue":
        throw { kind: "continue" };
      case "break":
        throw { kind: "break" };
      case "yield": {
        const v = visit(node.value);
        if (v === null) throw new Error("yield has no value");
        throw { kind: "yield", value: v };
      }
      case "return": {
        const v = visit(node.value);
        if (v === null) throw new Error("return has no value");
        throw { kind: "return", value: v };
      }
      case "fn": {
        scopes[scopes.length - 1]!.vars[node.name] = {
          tag: "fn",
          params: node.params,
          body: node.body,
          scopes: [...scopes],
          mutables: [...mutables],
        };
        return null;
      }
      case "call": {
        const fnVal = node.target ? visit(node.target) : lookup(node.name);
        if (fnVal === null) throw new Error("call target has no value");
        if (fnVal.tag !== "fn") throw new Error("not a function");
        const fn = fnVal;
        const fnScopes = [...fn.scopes, { vars: {}, mutable: {} }];
        const fnMutables = [...fn.mutables, {}];
        const argValues = node.args.map((a) => {
          const v = visit(a);
          if (v === null) throw new Error("argument has no value");
          return v;
        });
        fn.params.forEach((p, i) => {
          fnScopes[fnScopes.length - 1]!.vars[p] = argValues[i]!;
        });
        try {
          return evalAst(fn.body, fnScopes, fnMutables);
        } catch (e) {
          if (isControlFlow(e) && e.kind === "return") return e.value;
          throw e;
        }
      }
      case "wildcard":
        return num(0);
      case "null":
        return { tag: "null" };
      case "char":
        return num(node.value.charCodeAt(0));
      case "match": {
        const matchVal = visit(node.expr)!;
        for (const c of node.cases) {
          if (c.pattern.kind === "wildcard") {
            return visit(c.body);
          }
          const patternVal = visit(c.pattern)!;
          if (toNum(eq(matchVal, patternVal)) === 1) {
            return visit(c.body);
          }
        }
        return num(0);
      }
      case "tuple": {
        const values = node.elements.map((e) => {
          const v = visit(e);
          if (v === null) throw new Error("tuple element has no value");
          return v;
        });
        return { tag: "tuple", values };
      }
      case "index": {
        const target = visit(node.target);
        if (target === null) throw new Error("index target has no value");
        if (target.tag !== "tuple") throw new Error("cannot index non-tuple");
        return target.values[node.index]!;
      }
      case "array": {
        const values = node.elements.map((e) => {
          const v = visit(e);
          if (v === null) throw new Error("array element has no value");
          return v;
        });
        return { tag: "array", values };
      }
      case "array_index": {
        const target = visit(node.target);
        if (target === null) throw new Error("array target has no value");
        if (target.tag !== "array") throw new Error("cannot index non-array");
        const idx = toNum(visit(node.index)!);
        return target.values[idx]!;
      }
      case "string":
        return { tag: "string", value: node.value };
      case "string_index": {
        const target = visit(node.target);
        if (target === null) throw new Error("string target has no value");
        if (target.tag !== "string") throw new Error("cannot index non-string");
        const idx = toNum(visit(node.index)!);
        const ch = target.value[idx];
        if (ch === undefined) return num(0);
        return num(ch.charCodeAt(0));
      }
      case "property_access": {
        const target = visit(node.target);
        if (target === null)
          throw new Error("property access target has no value");
        if (target.tag === "record") {
          const val = target.fields[node.property];
          if (val === undefined) throw new Error(`field ${node.property} not found`);
          return val;
        }
        throw new Error(`cannot access property ${node.property} on ${target.tag}`);
      }
      case "length": {
        const target = visit(node.target);
        if (target === null) throw new Error("length target has no value");
        switch (target.tag) {
          case "string":
            return num(target.value.length);
          case "array":
            return num(target.values.length);
          default:
            throw new Error(`cannot get length of ${target.tag}`);
        }
      }
      case "record": {
        const fields: Record<string, Value> = {};
        for (const f of node.fields) {
          const v = visit(f.value);
          if (v === null) throw new Error("record field has no value");
          fields[f.key] = v;
        }
        return { tag: "record", fields };
      }
      case "typecheck": {
        const v = visit(node.value);
        if (v === null) throw new Error("typecheck value has no value");
        const resolvedType = resolveType(node.type);
        const typeName = resolvedType.toLowerCase();
        if (v.tag === "number" && v.type) {
          const resolvedValueType = resolveType(v.type);
          return bool(resolvedValueType === resolvedType);
        }
        const tagMap: Record<string, string> = {
          bool: "bool",
          string: "string",
          tuple: "tuple",
          array: "array",
          record: "record",
          null: "null",
          fn: "fn",
          ref: "ref",
        };
        const tagName = tagMap[typeName];
        if (tagName) return bool(v.tag === tagName);
        return bool(v.tag === "number" && !v.type && resolvedType === "number");
      }
      case "typealias": {
        typeAliases[node.name] = node.baseType;
        // Detect cycles after assignment
        let current = node.name;
        const seen = new Set<string>();
        while (typeAliases[current] !== undefined) {
          current = typeAliases[current]!;
          if (current === node.name) {
            throw new Error(`circular type alias: ${node.name}`);
          }
          if (seen.has(current)) {
            throw new Error(`circular type alias: ${current}`);
          }
          seen.add(current);
        }
        return null;
      }
    }
  }
  return visit(ast) ?? num(0);
}

function applyBinOp(op: string, left: Value, right: Value): Value {
  switch (op) {
    case "+":
      return num(toNum(left) + toNum(right));
    case "-":
      return num(toNum(left) - toNum(right));
    case "*":
      return num(toNum(left) * toNum(right));
    case "/":
      return num(toNum(left) / toNum(right));
    case "%":
      return num(toNum(left) % toNum(right));
    case "||":
      return bool(truthy(left) || truthy(right));
    case "&&":
      return bool(truthy(left) && truthy(right));
    case "==":
      return eq(left, right);
    case "!=":
      return ne(left, right);
    case "<":
      return lt(left, right);
    case "<=":
      return lte(left, right);
    case ">":
      return gt(left, right);
    case ">=":
      return gte(left, right);
    default:
      throw new Error(`unknown operator: ${op}`);
  }
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  const value = evalAst(ast, [{ vars: {}, mutable: {} }], [{}]);
  return toNum(value);
}
