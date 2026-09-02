export type Token =
  | { kind: "ident"; name: string; loc: Loc }
  | { kind: "keyword"; value: "let" | "mut" | "true" | "false"; loc: Loc }
  | { kind: "number"; value: string; loc: Loc }
  | { kind: "string"; value: string; loc: Loc }
  | { kind: "punct"; value: string; loc: Loc }
  | { kind: "eof"; loc: Loc };

export interface Loc {
  line: number;
  column: number;
}

const KEYWORDS = new Set(["let", "mut", "true", "false"]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  while (pos < source.length) {
    const ch = source[pos]!;

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\r") {
      pos++;
      col++;
      continue;
    }
    if (ch === "\n") {
      pos++;
      line++;
      col = 1;
      continue;
    }

    const loc: Loc = { line, column: col };

    // String literal
    if (ch === '"') {
      const end = source.indexOf('"', pos + 1);
      if (end === -1) {
        tokens.push({ kind: "punct", value: '"', loc });
        pos++;
        col++;
        continue;
      }
      const value = source.slice(pos, end + 1);
      tokens.push({ kind: "string", value, loc });
      pos = end + 1;
      col += value.length;
      continue;
    }

    // Number
    if (/[0-9]/.test(ch)) {
      let end = pos;
      while (end < source.length && /[0-9]/.test(source[end]!)) end++;
      const value = source.slice(pos, end);
      tokens.push({ kind: "number", value, loc });
      pos = end;
      col += value.length;
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let end = pos;
      while (end < source.length && /[\w]/.test(source[end]!)) end++;
      const name = source.slice(pos, end);
      if (KEYWORDS.has(name)) {
        tokens.push({ kind: "keyword", value: name as "let" | "mut" | "true" | "false", loc });
      } else {
        tokens.push({ kind: "ident", name, loc });
      }
      pos = end;
      col += name.length;
      continue;
    }

    // Multi-char operators
    const two = source.slice(pos, pos + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") {
      tokens.push({ kind: "punct", value: two, loc });
      pos += 2;
      col += 2;
      continue;
    }

    // &mut
    if (ch === "&" && source.slice(pos, pos + 5) === "&mut ") {
      tokens.push({ kind: "punct", value: "&mut", loc });
      pos += 5;
      col += 5;
      continue;
    }

    // Single-char punctuation
    if ("+-*/<>=(){}[].;,&*".includes(ch)) {
      tokens.push({ kind: "punct", value: ch, loc });
      pos++;
      col++;
      continue;
    }

    // Unknown character — emit as punct to let parser report error
    tokens.push({ kind: "punct", value: ch, loc });
    pos++;
    col++;
  }

  tokens.push({ kind: "eof", loc: { line, column: col } });
  return tokens;
}
