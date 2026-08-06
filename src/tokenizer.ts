import type { Token } from "./types";

export function tokenize(source: string): Token[] {
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
