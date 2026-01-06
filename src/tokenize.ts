import { parseNumber } from "./parseNumber";
import { Result, ok, err, isOk } from "./result";

export interface NumToken {
  type: "num";
  value: number;
}
export interface OpToken {
  type: "op";
  value: "+" | "-" | "*" | "/" | "%";
}
export interface ParenToken {
  type: "paren";
  value: "(" | ")";
}
export type Token = NumToken | OpToken | ParenToken;

function parseAndPushNumber(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const parsed = parseNumber(s, i);
  if (!isOk(parsed)) return err(parsed.error);
  const { value, nextIndex } = parsed.value;
  tokens.push({ type: "num", value });
  return ok(nextIndex);
}

function handleSignOrOperator(
  s: string,
  i: number,
  ch: string,
  tokens: Token[]
): Result<number, string> {
  const prev = tokens.length ? tokens[tokens.length - 1] : undefined;
  // unary sign if at start or after a non-number (op or paren)
  if (!prev || prev.type !== "num") {
    return parseAndPushNumber(s, i, tokens);
  }
  tokens.push({ type: "op", value: ch as "+" | "-" });
  return ok(i + 1);
}

export function tokenize(s: string): Result<Token[], string> {
  const tokens: Token[] = [];
  let i = 0;
  const len = s.length;

  while (i < len) {
    const ch = s[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      // skip whitespace
      i++;
    } else if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
    } else if ("+-*/%".includes(ch)) {
      if (ch === "+" || ch === "-") {
        const res = handleSignOrOperator(s, i, ch, tokens);
        if (!isOk(res)) return err(res.error);
        i = res.value;
      } else {
        tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" | "%" });
        i++;
      }
    } else if (/[0-9.]/.test(ch)) {
      const nextIndex = parseAndPushNumber(s, i, tokens);
      if (!isOk(nextIndex)) return err(nextIndex.error);
      i = nextIndex.value;
    } else {
      return err("Invalid numeric input");
    }
  }

  return ok(tokens);
}
