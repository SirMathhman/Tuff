import type { Token } from "./tokenize";
import { Result, err, ok } from "./result";

export function evalLeftToRight(tokens: Token[]): Result<number, string> {
  if (tokens.length === 0) return err("Invalid numeric input");
  if (tokens[0].type !== "num") return err("Invalid numeric input");

  let acc = tokens[0].value;
  let idx = 1;
  while (idx < tokens.length) {
    const op = tokens[idx];
    const nxt = tokens[idx + 1];
    if (!op || !nxt || op.type !== "op" || nxt.type !== "num")
      return err("Invalid numeric input");
    if (op.value === "+") acc = acc + nxt.value;
    else acc = acc - nxt.value;
    idx += 2;
  }

  return ok(acc);
}
