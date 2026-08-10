import type { Token, IntType } from "./types";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      let num = "";
      while (i < source.length && /\d/.test(source[i]!)) {
        num += source[i]!;
        i++;
      }
      const suffix = source.slice(i, i + 4);
      let intType: false | IntType = false;
      if (suffix === "U16" || suffix === "U32" || suffix === "I16" || suffix === "I32") {
        intType = suffix as IntType;
        i += 4;
      } else {
        const short = source.slice(i, i + 2);
        if (short === "U8" || short === "I8") {
          intType = short as IntType;
          i += 2;
        }
      }
      tokens.push({ type: "number", value: num, intType });
    } else if (ch === "." && source[i + 1] === ".") {
      tokens.push({ type: "op", value: ".." });
      i += 2;
    } else if (ch === ">" && source[i + 1] === ">") {
      tokens.push({ type: "op", value: ">>" });
      i += 2;
    } else if (ch === ">") {
      tokens.push({ type: "punct", value: ">" });
      i++;
    } else if (ch === "+" && source[i + 1] === "=") {
      tokens.push({ type: "op", value: "+=" });
      i += 2;
    } else if (/[+\-*/]/.test(ch)) {
      tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" });
      i++;
    } else if (ch === "=" && source[i + 1] === "=") {
      tokens.push({ type: "op", value: "==" });
      i += 2;
    } else if (ch === "<") {
      tokens.push({ type: "op", value: "<" });
      i++;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      if (
        ident === "in" ||
        ident === "let" ||
        ident === "mut" ||
        ident === "if" ||
        ident === "else" ||
        ident === "while" ||
        ident === "for" ||
        ident === "break" ||
        ident === "continue" ||
        ident === "match" ||
        ident === "case" ||
        ident === "is"
      ) {
        tokens.push({
          type: "keyword",
          value: ident as
            | "in"
            | "let"
            | "mut"
            | "if"
            | "else"
            | "while"
            | "for"
            | "break"
            | "continue"
            | "match"
            | "case",
        });
      } else if (ident === "true") {
        tokens.push({ type: "boolean", value: true });
      } else if (ident === "false") {
        tokens.push({ type: "boolean", value: false });
      } else {
        tokens.push({ type: "identifier", value: ident });
      }
    } else if (ch === ";") {
      tokens.push({ type: "punct", value: ";" });
      i++;
    } else if (ch === "=" && source[i + 1] === ">") {
      tokens.push({ type: "op", value: "=>" });
      i += 2;
    } else if (ch === "=") {
      tokens.push({ type: "punct", value: "=" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "punct", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "punct", value: ")" });
      i++;
    } else if (ch === "{") {
      tokens.push({ type: "punct", value: "{" });
      i++;
    } else if (ch === "[") {
      tokens.push({ type: "punct", value: "[" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "punct", value: "]" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "punct", value: "}" });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "punct", value: "," });
      i++;
    } else if (ch === ":") {
      tokens.push({ type: "punct", value: ":" });
      i++;
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  tokens.push({ type: "eof" });
  return tokens;
}
