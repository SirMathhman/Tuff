export type Token =
  | { type: "number"; value: number }
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
        | "<"
        | ">"
        | "+=";
    }
  | { type: "group"; value: "(" | ")" | "{" | "}" }
  | {
      type: "keyword";
      value:
        "let" | "mut" | "true" | "false" | "if" | "else" | "loop" | "break";
    }
  | { type: "identifier"; value: string }
  | { type: "punctuator"; value: ";" };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
    } else if (ch >= "0" && ch <= "9") {
      let numStr = "";
      while (i < source.length) {
        const c = source.charAt(i);
        if (c < "0" || c > "9") break;
        numStr += c;
        i++;
      }
      tokens.push({ type: "number", value: Number(numStr) });
    } else if ((ch >= "a" && ch <= "z") || ch === "_") {
      let ident = "";
      while (
        i < source.length &&
        ((source.charAt(i) >= "a" && source.charAt(i) <= "z") ||
          source.charAt(i) === "_")
      ) {
        ident += source.charAt(i);
        i++;
      }
      if (ident === "let") {
        tokens.push({ type: "keyword", value: "let" });
      } else if (ident === "true") {
        tokens.push({ type: "keyword", value: "true" });
      } else if (ident === "false") {
        tokens.push({ type: "keyword", value: "false" });
      } else if (ident === "if") {
        tokens.push({ type: "keyword", value: "if" });
      } else if (ident === "else") {
        tokens.push({ type: "keyword", value: "else" });
      } else if (ident === "mut") {
        tokens.push({ type: "keyword", value: "mut" });
      } else if (ident === "loop") {
        tokens.push({ type: "keyword", value: "loop" });
      } else if (ident === "break") {
        tokens.push({ type: "keyword", value: "break" });
      } else {
        tokens.push({ type: "identifier", value: ident });
      }
    } else if (ch === "+") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "+=" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: "+" });
        i++;
      }
    } else if (ch === "-") {
      tokens.push({ type: "operator", value: "-" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "operator", value: "*" });
      i++;
    } else if (ch === "/") {
      tokens.push({ type: "operator", value: "/" });
      i++;
    } else if (ch === "|") {
      if (i + 1 < source.length && source.charAt(i + 1) === "|") {
        tokens.push({ type: "operator", value: "||" });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === "&") {
      if (i + 1 < source.length && source.charAt(i + 1) === "&") {
        tokens.push({ type: "operator", value: "&&" });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === "<") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "<=" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: "<" });
        i++;
      }
    } else if (ch === ">") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: ">=" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: ">" });
        i++;
      }
    } else if (ch === "=") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "==" });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: "=" });
        i++;
      }
    } else if (ch === "!") {
      if (i + 1 < source.length && source.charAt(i + 1) === "=") {
        tokens.push({ type: "operator", value: "!=" });
        i += 2;
      } else {
        i++;
      }
    } else if (ch === ";") {
      tokens.push({ type: "punctuator", value: ";" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "group", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "group", value: ")" });
      i++;
    } else if (ch === "{") {
      tokens.push({ type: "group", value: "{" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "group", value: "}" });
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}
