import type { Token } from "./ast";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    // Skip whitespace
    if (
      source[i] === " " ||
      source[i] === "\t" ||
      source[i] === "\n" ||
      source[i] === "\r"
    ) {
      i++;
      continue;
    }

    // Number literal
    const charCode = source.charCodeAt(i);
    if (charCode !== undefined && charCode >= 48 && charCode <= 57) {
      let num = "";
      while (i < source.length) {
        const c = source.charCodeAt(i);
        if (c === undefined) break;
        if ((c >= 48 && c <= 57) || c === 46) {
          num += source[i];
          i++;
        } else {
          break;
        }
      }
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }

    // Identifier or keyword
    const ch = source[i]!;
    if (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_" ||
      ch === "$"
    ) {
      let name = "";
      while (i < source.length) {
        const c = source[i]!;
        if (
          (c >= "a" && c <= "z") ||
          (c >= "A" && c <= "Z") ||
          (c >= "0" && c <= "9") ||
          c === "_" ||
          c === "$"
        ) {
          name += c;
          i++;
        } else {
          break;
        }
      }
      if (name === "let") {
        tokens.push({ type: "let" });
      } else if (name === "mut") {
        tokens.push({ type: "mut" });
      } else {
        tokens.push({ type: "identifier", name });
      }
      continue;
    }

    // Single-character tokens
    const char = source[i]!;
    if (char === "+") {
      tokens.push({ type: "plus" });
      i++;
      continue;
    }
    if (char === "-") {
      tokens.push({ type: "minus" });
      i++;
      continue;
    }
    if (char === "*") {
      tokens.push({ type: "star" });
      i++;
      continue;
    }
    if (char === "/") {
      tokens.push({ type: "slash" });
      i++;
      continue;
    }
    if (char === ".") {
      tokens.push({ type: "dot" });
      i++;
      continue;
    }
    if (char === "=") {
      tokens.push({ type: "equals" });
      i++;
      continue;
    }
    if (char === ";") {
      tokens.push({ type: "semicolon" });
      i++;
      continue;
    }

    // Unknown character, skip
    i++;
  }

  tokens.push({ type: "eof" });
  return tokens;
}
