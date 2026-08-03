import type { Token } from "./types";

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;

    if (char === " ") {
      i++;
      continue;
    }

    if (char >= "0" && char <= "9") {
      let value = "";
      while (i < source.length && source[i]! >= "0" && source[i]! <= "9") {
        value += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(value) });
      continue;
    }

    if (isLetter(char)) {
      let value = "";
      while (i < source.length && isLetter(source[i]!)) {
        value += source[i];
        i++;
      }
      if (value === "true" || value === "false") {
        tokens.push({ type: "boolean", value: value === "true" });
      } else {
        tokens.push({ type: "identifier", value });
      }
      continue;
    }

    if (char === ";") {
      tokens.push({ type: "semicolon", value: char });
      i++;
      continue;
    }

    if (char === "<" || char === ">") {
      const next = source[i + 1];
      if (next === "=") {
        tokens.push({ type: "operator", value: (char + next) as "<=" | ">=" });
        i += 2;
        continue;
      }
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (char === "!") {
      const next = source[i + 1];
      if (next === "=") {
        tokens.push({ type: "operator", value: "!=" });
        i += 2;
        continue;
      }
      throw new Error(`Unexpected character: ${char}`);
    }

    if (char === "=") {
      const next = source[i + 1];
      if (next === "=") {
        tokens.push({ type: "operator", value: "==" });
        i += 2;
        continue;
      }
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      const next = source[i + 1];
      if (next === "=") {
        tokens.push({ type: "operator", value: (char + next) as "+=" | "-=" | "*=" | "/=" });
        i += 2;
        continue;
      }
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (char === "(" || char === ")" || char === "{" || char === "}") {
      tokens.push({ type: "paren", value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

function isLetter(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}
