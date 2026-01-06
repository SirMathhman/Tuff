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

function evalTokensToNumber(tokens: Token[]): Result<number, string> {
  const folded = foldMultiplication(tokens);
  if (folded.ok === false) return folded;
  return evalAddSub(folded.value);
}

function reduceParentheses(tokens: Token[]): Result<Token[], string> {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "paren" && t.value === "(") {
      // find matching ')'
      let j = i + 1;
      let depth = 1;
      while (j < tokens.length && depth > 0) {
        const u = tokens[j];
        if (u.type === "paren") {
          if (u.value === "(") depth++;
          else if (u.value === ")") depth--;
        }
        if (depth === 0) break;
        j++;
      }
      if (depth !== 0) return err("Invalid numeric input");
      const sub = tokens.slice(i + 1, j);
      if (sub.length === 0) return err("Invalid numeric input");
      const reducedSub = reduceParentheses(sub);
      if (reducedSub.ok === false) return reducedSub;
      const valRes = evalTokensToNumber(reducedSub.value);
      if (valRes.ok === false) return valRes;
      out.push({ type: "num", value: valRes.value });
      i = j + 1;
    } else {
      out.push(t);
      i++;
    }
  }
  return ok(out);
}

export function evalLeftToRight(tokens: Token[]): Result<number, string> {
  // First, reduce parentheses
  const reduced = reduceParentheses(tokens);
  if (reduced.ok === false) return reduced;

  if (reduced.value.length === 0) return err("Invalid numeric input");
  if (reduced.value[0].type !== "num") return err("Invalid numeric input");

  return evalTokensToNumber(reduced.value);
}
