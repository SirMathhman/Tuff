import { parseNumber } from "./parseNumber";

export interface NumToken {
  type: "num";
  value: number;
}
export interface OpToken {
  type: "op";
  value: "+" | "-";
}
export type Token = NumToken | OpToken;

export function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = s.length;

  while (i < len) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    if (ch === "+" || ch === "-") {
      const prev = tokens.length ? tokens[tokens.length - 1] : null;
      // unary sign if at start or after an operator
      if (!prev || prev.type === "op") {
        const { value, nextIndex } = parseNumber(s, i);
        tokens.push({ type: "num", value });
        i = nextIndex;
        continue;
      } else {
        tokens.push({ type: "op", value: ch });
        i++;
        continue;
      }
    }

    if (/[0-9.]/.test(ch)) {
      const { value, nextIndex } = parseNumber(s, i);
      tokens.push({ type: "num", value });
      i = nextIndex;
      continue;
    }

    throw new Error("Invalid numeric input");
  }

  return tokens;
}
