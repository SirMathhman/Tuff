import { TYPE_SUFFIXES } from "../core/grammar";

export type TokenPos = { line: number; column: number };

/** Type guard: is this a number token? */
export function isNumberToken(
  t: Token,
): t is Extract<Token, { type: "number" }> {
  return t.type === "number";
}

/** Type guard: is this an identifier token? */
export function isIdentifierToken(
  t: Token,
): t is Extract<Token, { type: "identifier" }> {
  return t.type === "identifier";
}

export type Token =
  | { type: "number"; value: number; typeSuffix?: string; pos: TokenPos }
  | {
      type: "operator";
      value:
        | "+"
        | "-"
        | "*"
        | "/"
        | "="
        | "=="
        | "!="
        | "<="
        | ">="
        | "||"
        | "&&"
        | "|"
        | "<"
        | ">"
        | "+="
        | "=>"
        | "&";
      pos: TokenPos;
    }
  | { type: "group"; value: "(" | ")" | "{" | "}" | "[" | "]"; pos: TokenPos }
  | {
      type: "keyword";
      value:
        | "let"
        | "mut"
        | "true"
        | "false"
        | "if"
        | "else"
        | "loop"
        | "break"
        | "while"
        | "is"
        | "fn"
        | "struct"
        | "match"
        | "case"
        | "yield"
        | "return"
        | "continue"
        | "type"
        | "enum";
      pos: TokenPos;
    }
  | { type: "identifier"; value: string; pos: TokenPos }
  | { type: "punctuator"; value: ";" | ":" | "," | "." | "::"; pos: TokenPos };

function isUnaryContext(tokens: Token[]): boolean {
  if (tokens.length === 0) return true;
  const last = tokens[tokens.length - 1]!;
  if (last.type === "group") return last.value === "(" || last.value === "{";
  if (last.type === "operator") return true;
  if (last.type === "punctuator") return true;
  return false;
}

function readDigits(
  source: string,
  start: number,
): { numStr: string; end: number } {
  let numStr = "";
  let i = start;
  while (i < source.length) {
    const c = source.charAt(i);
    if (c < "0" || c > "9") break;
    numStr += c;
    i++;
  }
  return { numStr, end: i };
}

function parseNumberWithSuffix(
  tokens: Token[],
  source: string,
  numStr: string,
  i: number,
  pos: TokenPos,
): number {
  // Recognize and skip type suffixes (e.g. U8, I32, F64).
  // Range validation is deferred to the analyzer.
  const suffixDef = TYPE_SUFFIXES.find((s) => s.prefix === source.charAt(i));
  let typeSuffix: string | undefined;
  if (suffixDef) {
    i++;
    let suffixNum = "";
    while (
      i < source.length &&
      source.charAt(i) >= "0" &&
      source.charAt(i) <= "9"
    ) {
      suffixNum += source.charAt(i);
      i++;
    }
    typeSuffix = suffixDef.prefix + suffixNum;
  }
  tokens.push({ type: "number", value: Number(numStr), typeSuffix, pos });
  return i;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  while (i < source.length) {
    const ch = source.charAt(i);

    if (ch === " " || ch === "\t") {
      i++;
      column++;
    } else if (ch === "\n") {
      i++;
      line++;
      column = 1;
    } else if (ch === "\r") {
      if (i + 1 < source.length && source.charAt(i + 1) === "\n") {
        i += 2;
      } else {
        i++;
      }
      line++;
      column = 1;
    } else if (ch >= "0" && ch <= "9") {
      const tokenPos: TokenPos = { line, column };
      const { numStr, end } = readDigits(source, i);
      const consumed = parseNumberWithSuffix(
        tokens,
        source,
        numStr,
        end,
        tokenPos,
      );
      column += consumed - i;
      i = consumed;
    } else if (
      ch === "-" &&
      i + 1 < source.length &&
      source.charAt(i + 1) >= "0" &&
      source.charAt(i + 1) <= "9" &&
      isUnaryContext(tokens)
    ) {
      const tokenPos: TokenPos = { line, column };
      i++;
      const { numStr, end } = readDigits(source, i);
      const consumed = parseNumberWithSuffix(
        tokens,
        source,
        "-" + numStr,
        end,
        tokenPos,
      );
      column += consumed - i;
      i = consumed;
    } else if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      ch === "_"
    ) {
      const tokenPos: TokenPos = { line, column };
      let ident = "";
      while (
        i < source.length &&
        ((source.charAt(i) >= "A" && source.charAt(i) <= "Z") ||
          (source.charAt(i) >= "a" && source.charAt(i) <= "z") ||
          source.charAt(i) === "_" ||
          (source.charAt(i) >= "0" && source.charAt(i) <= "9"))
      ) {
        ident += source.charAt(i);
        i++;
      }
      const len = ident.length;
      const lower = ident.toLowerCase();
      if (lower === "let") {
        tokens.push({ type: "keyword", value: "let", pos: tokenPos });
      } else if (lower === "true") {
        tokens.push({ type: "keyword", value: "true", pos: tokenPos });
      } else if (lower === "false") {
        tokens.push({ type: "keyword", value: "false", pos: tokenPos });
      } else if (lower === "if") {
        tokens.push({ type: "keyword", value: "if", pos: tokenPos });
      } else if (lower === "else") {
        tokens.push({ type: "keyword", value: "else", pos: tokenPos });
      } else if (lower === "mut") {
        tokens.push({ type: "keyword", value: "mut", pos: tokenPos });
      } else if (lower === "loop") {
        tokens.push({ type: "keyword", value: "loop", pos: tokenPos });
      } else if (lower === "break") {
        tokens.push({ type: "keyword", value: "break", pos: tokenPos });
      } else if (lower === "while") {
        tokens.push({ type: "keyword", value: "while", pos: tokenPos });
      } else if (lower === "is") {
        tokens.push({ type: "keyword", value: "is", pos: tokenPos });
      } else if (lower === "fn") {
        tokens.push({ type: "keyword", value: "fn", pos: tokenPos });
      } else if (lower === "struct") {
        tokens.push({ type: "keyword", value: "struct", pos: tokenPos });
      } else if (lower === "match") {
        tokens.push({ type: "keyword", value: "match", pos: tokenPos });
      } else if (lower === "case") {
        tokens.push({ type: "keyword", value: "case", pos: tokenPos });
      } else if (lower === "yield") {
        tokens.push({ type: "keyword", value: "yield", pos: tokenPos });
      } else if (lower === "return") {
        tokens.push({ type: "keyword", value: "return", pos: tokenPos });
      } else if (lower === "continue") {
        tokens.push({ type: "keyword", value: "continue", pos: tokenPos });
      } else if (lower === "type") {
        tokens.push({ type: "keyword", value: "type", pos: tokenPos });
      } else if (lower === "enum") {
        tokens.push({ type: "keyword", value: "enum", pos: tokenPos });
      } else {
        tokens.push({ type: "identifier", value: ident, pos: tokenPos });
      }
      column += len;
    } else {
      const tokenPos: TokenPos = { line, column };
      const len = matchSingleCharToken(ch, i, source, tokens, tokenPos);
      i += len;
      column += len;
    }
  }
  return tokens;
}

/** Match a single-character (or multi-char) punctuation/operator/group token. Returns the number of chars consumed. */
function matchSingleCharToken(
  ch: string,
  i: number,
  source: string,
  tokens: Token[],
  pos: TokenPos,
): number {
  if (ch === "+") {
    if (i + 1 < source.length && source.charAt(i + 1) === "=") {
      tokens.push({ type: "operator", value: "+=", pos });
      return 2;
    }
    tokens.push({ type: "operator", value: "+", pos });
    return 1;
  }
  if (ch === "-") {
    tokens.push({ type: "operator", value: "-", pos });
    return 1;
  }
  if (ch === "*") {
    tokens.push({ type: "operator", value: "*", pos });
    return 1;
  }
  if (ch === "&") {
    if (i + 1 < source.length && source.charAt(i + 1) === "&") {
      tokens.push({ type: "operator", value: "&&", pos });
      return 2;
    }
    tokens.push({ type: "operator", value: "&", pos });
    return 1;
  }
  if (ch === "/") {
    tokens.push({ type: "operator", value: "/", pos });
    return 1;
  }
  if (ch === "|") {
    if (i + 1 < source.length && source.charAt(i + 1) === "|") {
      tokens.push({ type: "operator", value: "||", pos });
      return 2;
    }
    tokens.push({ type: "operator", value: "|", pos });
    return 1;
  }
  if (ch === "<") {
    if (i + 1 < source.length && source.charAt(i + 1) === "=") {
      tokens.push({ type: "operator", value: "<=", pos });
      return 2;
    }
    tokens.push({ type: "operator", value: "<", pos });
    return 1;
  }
  if (ch === ">") {
    if (i + 1 < source.length && source.charAt(i + 1) === "=") {
      tokens.push({ type: "operator", value: ">=", pos });
      return 2;
    }
    tokens.push({ type: "operator", value: ">", pos });
    return 1;
  }
  if (ch === "=") {
    if (i + 1 < source.length && source.charAt(i + 1) === "=") {
      tokens.push({ type: "operator", value: "==", pos });
      return 2;
    }
    if (i + 1 < source.length && source.charAt(i + 1) === ">") {
      tokens.push({ type: "operator", value: "=>", pos });
      return 2;
    }
    tokens.push({ type: "operator", value: "=", pos });
    return 1;
  }
  if (ch === "!") {
    if (i + 1 < source.length && source.charAt(i + 1) === "=") {
      tokens.push({ type: "operator", value: "!=", pos });
      return 2;
    }
    return 1;
  }
  if (ch === ";") {
    tokens.push({ type: "punctuator", value: ";", pos });
    return 1;
  }
  if (ch === ":") {
    if (i + 1 < source.length && source.charAt(i + 1) === ":") {
      tokens.push({ type: "punctuator", value: "::", pos });
      return 2;
    }
    tokens.push({ type: "punctuator", value: ":", pos });
    return 1;
  }
  if (ch === ",") {
    tokens.push({ type: "punctuator", value: ",", pos });
    return 1;
  }
  if (ch === ".") {
    tokens.push({ type: "punctuator", value: ".", pos });
    return 1;
  }
  if (ch === "(") {
    tokens.push({ type: "group", value: "(", pos });
    return 1;
  }
  if (ch === ")") {
    tokens.push({ type: "group", value: ")", pos });
    return 1;
  }
  if (ch === "{") {
    tokens.push({ type: "group", value: "{", pos });
    return 1;
  }
  if (ch === "}") {
    tokens.push({ type: "group", value: "}", pos });
    return 1;
  }
  if (ch === "[") {
    tokens.push({ type: "group", value: "[", pos });
    return 1;
  }
  if (ch === "]") {
    tokens.push({ type: "group", value: "]", pos });
    return 1;
  }
  // Unknown char — skip
  return 1;
}
