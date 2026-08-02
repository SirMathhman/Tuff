export type TokenType =
  "identifier" | "number" | "string" | "keyword" | "punct";

export interface Token {
  type: TokenType;
  value: string;
  /** Optional integer suffix on a number literal, e.g. `U8` in `100U8`. */
  suffix?: string;
}

const KEYWORDS = new Set(["in", "let"]);

const PUNCTUATION = new Set([":", ";", ".", "&", "[", "]", "=", "-"]);

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    // Skip whitespace.
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Identifiers and keywords.
    if (isIdentifierStart(ch)) {
      let value = "";
      while (i < source.length && isIdentifierPart(source[i]!)) {
        value += source[i]!;
        i++;
      }
      tokens.push({
        type: KEYWORDS.has(value) ? "keyword" : "identifier",
        value,
      });
      continue;
    }

    // Numbers.
    if (isDigit(ch)) {
      let value = "";
      while (i < source.length && isDigit(source[i]!)) {
        value += source[i]!;
        i++;
      }
      // Optional integer suffix, e.g. `U8` in `100U8`.
      let suffix: string | undefined;
      if (i < source.length && isIdentifierStart(source[i]!)) {
        let suffixValue = "";
        while (i < source.length && isIdentifierPart(source[i]!)) {
          suffixValue += source[i]!;
          i++;
        }
        suffix = suffixValue;
      }
      tokens.push({ type: "number", value, suffix });
      continue;
    }

    // Strings.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let value = "";
      while (i < source.length && source[i] !== quote) {
        value += source[i]!;
        i++;
      }
      if (i >= source.length) {
        throw new Error("Unterminated string literal");
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value });
      continue;
    }

    // Punctuation.
    if (PUNCTUATION.has(ch)) {
      tokens.push({ type: "punct", value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}
