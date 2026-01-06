import type { Token } from "./tokenize";

export function evalLeftToRight(tokens: Token[]): number {
  if (tokens.length === 0) throw new Error("Invalid numeric input");
  if (tokens[0].type !== "num") throw new Error("Invalid numeric input");

  let acc = tokens[0].value;
  let idx = 1;
  while (idx < tokens.length) {
    const op = tokens[idx];
    const nxt = tokens[idx + 1];
    if (!op || !nxt || op.type !== "op" || nxt.type !== "num")
      throw new Error("Invalid numeric input");
    if (op.value === "+") acc = acc + nxt.value;
    else acc = acc - nxt.value;
    idx += 2;
  }

  return acc;
}
