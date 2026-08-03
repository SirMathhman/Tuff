import type { Token, IntegerTypeName } from "./types";

const SUFFIXES: Record<string, IntegerTypeName> = {
  U8: "U8",
  U16: "U16",
  U32: "U32",
  U64: "U64",
  I8: "I8",
  I16: "I16",
  I32: "I32",
  I64: "I64",
};

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
      const suffix = readIntegerSuffix(source, i);
      if (suffix) {
        i = suffix.i;
      }
      tokens.push({ type: "number", value: Number(value), typeName: suffix?.typeName });
      continue;
    }

    if (isLetter(char)) {
      let value = "";
      while (i < source.length && isLetter(source[i]!)) {
        value += source[i];
        i++;
      }
      if (value === "U" || value === "I") {
        const suffix = readIntegerSuffix(source, i - 1);
        if (suffix) {
          value = suffix.typeName;
          i = suffix.i;
        }
      }
      if (value === "true" || value === "false") {
        tokens.push({ type: "boolean", value: value === "true" });
      } else if (value === "is") {
        tokens.push({ type: "operator", value: "is" });
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

    if (char === "[" || char === "]") {
      tokens.push({ type: "bracket", value: char });
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

function readIntegerSuffix(source: string, i: number): { typeName: IntegerTypeName; i: number } | undefined {
  const prefix = source[i]!;
  if (prefix !== "U" && prefix !== "I") {
    return undefined;
  }
  const second = source[i + 1];
  if (second === undefined) {
    return undefined;
  }
  let digits: string;
  if (second === "8") {
    digits = "8";
  } else {
    const third = source[i + 2];
    if (third === undefined) {
      return undefined;
    }
    digits = second + third;
  }
  const typeName = SUFFIXES[prefix + digits];
  if (!typeName) {
    return undefined;
  }
  return { typeName, i: i + 1 + digits.length };
}
