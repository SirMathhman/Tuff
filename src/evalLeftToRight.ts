import type { Token } from "./tokenize";
import { Result, err, ok } from "./result";

function foldMultiplication(tokens: Token[]): Result<Token[], string> {
  const stack: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "num") {
      stack.push(t);
      i++;
    } else {
      const op = t;
      if (op.value === "*") {
        const lhs = stack.pop();
        const rhs = tokens[i + 1];
        if (!lhs || lhs.type !== "num" || !rhs || rhs.type !== "num")
          return err("Invalid numeric input");
        const prod = lhs.value * rhs.value;
        stack.push({ type: "num", value: prod });
        i += 2;
      } else {
        stack.push(op);
        i++;
      }
    }
  }
  return ok(stack);
}

function evalAddSub(tokens: Token[]): Result<number, string> {
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

export function evalLeftToRight(tokens: Token[]): Result<number, string> {
  if (tokens.length === 0) return err("Invalid numeric input");
  if (tokens[0].type !== "num") return err("Invalid numeric input");

  const folded = foldMultiplication(tokens);
  if (folded.ok === false) return folded;
  return evalAddSub(folded.value);
}
