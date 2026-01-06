import { parseNumber } from "./parseNumber";
import { Result, ok, err, isOk } from "./result";

export interface NumToken {
  type: "num";
  value: number;
}
export interface OpToken {
  type: "op";
  value: "+" | "-";
}
export type Token = NumToken | OpToken;

export function tokenize(s: string): Result<Token[], string> {
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
      const prev = tokens.length ? tokens[tokens.length - 1] : undefined;
      // unary sign if at start or after an operator
      if (!prev || prev.type === "op") {
        const parsed = parseNumber(s, i);
        if (!isOk(parsed)) return err(parsed.error);
        const { value, nextIndex } = parsed.value;
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
      const parsed = parseNumber(s, i);
      if (!isOk(parsed)) return err(parsed.error);
      const { value, nextIndex } = parsed.value;
      tokens.push({ type: "num", value });
      i = nextIndex;
      continue;
    }

    return err("Invalid numeric input");
  }

  return ok(tokens);
}
