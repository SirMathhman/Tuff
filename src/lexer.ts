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
      let u8 = false;
      let u16 = false;
      let u32 = false;
      let u64 = false;
      let i8 = false;
      let i16 = false;
      let i64 = false;
      if (source[i] === "U" && source[i + 1] === "8") {
        u8 = true;
        i += 2;
      } else if (source[i] === "U" && source[i + 1] === "1" && source[i + 2] === "6") {
        u16 = true;
        i += 3;
      } else if (source[i] === "U" && source[i + 1] === "3" && source[i + 2] === "2") {
        u32 = true;
        i += 3;
      } else if (source[i] === "U" && source[i + 1] === "6" && source[i + 2] === "4") {
        u64 = true;
        i += 3;
      } else if (source[i] === "I" && source[i + 1] === "8") {
        i8 = true;
        i += 2;
      } else if (source[i] === "I" && source[i + 1] === "1" && source[i + 2] === "6") {
        i16 = true;
        i += 3;
      } else if (source[i] === "I" && source[i + 1] === "6" && source[i + 2] === "4") {
        i64 = true;
        i += 3;
      }
      tokens.push({ type: "number", value: Number(value), u8, u16, u32, u64, i8, i16, i64 });
      continue;
    }

    if (isLetter(char)) {
      let value = "";
      while (i < source.length && isLetter(source[i]!)) {
        value += source[i];
        i++;
      }
      if (value === "U" && (source[i] === "8" || (source[i] === "1" && source[i + 1] === "6") || (source[i] === "3" && source[i + 1] === "2") || (source[i] === "6" && source[i + 1] === "4"))) {
        if (source[i] === "8") {
          value += "8";
          i++;
        } else {
          value += source[i] + source[i + 1];
          i += 2;
        }
      } else if (value === "I" && (source[i] === "8" || (source[i] === "1" && source[i + 1] === "6") || (source[i] === "3" && source[i + 1] === "2") || (source[i] === "6" && source[i + 1] === "4"))) {
        if (source[i] === "8") {
          value += "8";
          i++;
        } else {
          value += source[i] + source[i + 1];
          i += 2;
        }
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

    if (char === ",") {
      tokens.push({ type: "comma", value: char });
      i++;
      continue;
    }

    if (char === ":") {
      tokens.push({ type: "colon", value: char });
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
      tokens.push({ type: "operator", value: "!" });
      i++;
      continue;
    }

    if (char === "=") {
      const next = source[i + 1];
      if (next === "=") {
        tokens.push({ type: "operator", value: "==" });
        i += 2;
        continue;
      }
      if (next === ">") {
        tokens.push({ type: "operator", value: "=>" });
        i += 2;
        continue;
      }
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (char === "&") {
      const next = source[i + 1];
      if (next === "&") {
        tokens.push({ type: "operator", value: "&&" });
        i += 2;
        continue;
      }
      throw new Error(`Unexpected character: ${char}`);
    }

    if (char === "|") {
      const next = source[i + 1];
      if (next === "|") {
        tokens.push({ type: "operator", value: "||" });
        i += 2;
        continue;
      }
      throw new Error(`Unexpected character: ${char}`);
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%") {
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
