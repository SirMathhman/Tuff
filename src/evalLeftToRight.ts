import type { Token } from "./tokenize";
import { Result, err, ok } from "./result";

function applyComparisonOp(
  op: string,
  lhs: number,
  rhs: number
): Result<number, string> {
  if (op === "<") return ok(lhs < rhs ? 1 : 0);
  if (op === ">") return ok(lhs > rhs ? 1 : 0);
  if (op === "<=") return ok(lhs <= rhs ? 1 : 0);
  if (op === ">=") return ok(lhs >= rhs ? 1 : 0);
  if (op === "==") return ok(lhs === rhs ? 1 : 0);
  if (op === "!=") return ok(lhs !== rhs ? 1 : 0);
  return err("Invalid numeric input");
}

function evalBinaryOp(
  tokens: Token[],
  opType: "comp" | "op",
  applyOp: (op: string, lhs: number, rhs: number) => Result<number, string>
): Result<number, string> {
  if (tokens.length === 0) return err("Invalid numeric input");
  if (tokens[0].type !== "num") return err("Invalid numeric input");

  let acc = tokens[0].value;
  let idx = 1;
  while (idx < tokens.length) {
    const op = tokens[idx];
    const nxt = tokens[idx + 1];
    if (!op || !nxt || op.type !== opType || nxt.type !== "num")
      return err("Invalid numeric input");
    const res = applyOp(op.value, acc, nxt.value);
    if (res.ok === false) return res;
    acc = res.value;
    idx += 2;
  }
  return ok(acc);
}

function applyMultiplicativeOp(
  op: string,
  lhs: Token,
  rhs: Token
): Result<Token, string> {
  if (!lhs || lhs.type !== "num" || !rhs || rhs.type !== "num")
    return err("Invalid numeric input");
  if (op === "*")
    return ok({
      type: "num",
      value: (lhs.value as number) * (rhs.value as number),
    });
  if (op === "/") {
    if ((rhs.value as number) === 0) return err("Division by zero");
    return ok({
      type: "num",
      value: (lhs.value as number) / (rhs.value as number),
    });
  }
  if (op === "%") {
    if ((rhs.value as number) === 0) return err("Division by zero");
    return ok({
      type: "num",
      value: (lhs.value as number) % (rhs.value as number),
    });
  }
  return err("Invalid numeric input");
}

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
      if (op.type !== "op") return err("Invalid numeric input");
      if (op.value === "*" || op.value === "/" || op.value === "%") {
        const lhs = stack.pop();
        const rhs = tokens[i + 1];
        if (!lhs || !rhs) return err("Invalid numeric input");
        const res = applyMultiplicativeOp(op.value, lhs, rhs);
        if (res.ok === false) return res;
        stack.push(res.value);
        i += 2;
      } else {
        stack.push(op);
        i++;
      }
    }
  }
  return ok(stack);
}

function applyAddSubOp(
  op: string,
  lhs: number,
  rhs: number
): Result<number, string> {
  if (op === "+") return ok(lhs + rhs);
  if (op === "-") return ok(lhs - rhs);
  return err("Invalid numeric input");
}

function evalAddSub(tokens: Token[]): Result<number, string> {
  return evalBinaryOp(tokens, "op", applyAddSubOp);
}

function evalTokensToNumber(tokens: Token[]): Result<number, string> {
  // Separate arithmetic tokens from comparison tokens
  const arithmeticTokens: Token[] = [];

  // Extract just the arithmetic part (stop at first comparison)
  let i = 0;
  while (i < tokens.length && tokens[i].type !== "comp") {
    arithmeticTokens.push(tokens[i]);
    i++;
  }

  // Evaluate arithmetic part
  const folded = foldMultiplication(arithmeticTokens);
  if (folded.ok === false) return folded;
  const addSubRes = evalAddSub(folded.value);
  if (addSubRes.ok === false) return addSubRes;

  // If no comparisons, return the arithmetic result
  if (i >= tokens.length) return ok(addSubRes.value);

  // Process comparisons
  let currentValue = addSubRes.value;
  while (i < tokens.length) {
    if (tokens[i].type !== "comp") return err("Invalid numeric input");
    const op = tokens[i].value as unknown as string;
    i++;

    // Next token should be a number - could be a literal number or start of an arithmetic expression
    // We need to parse the next operand
    const operandTokens: Token[] = [];
    while (i < tokens.length && tokens[i].type !== "comp") {
      operandTokens.push(tokens[i]);
      i++;
    }

    if (operandTokens.length === 0) return err("Invalid numeric input");

    // Evaluate the right operand
    const rightFolded = foldMultiplication(operandTokens);
    if (rightFolded.ok === false) return rightFolded;
    const rightAddSubRes = evalAddSub(rightFolded.value);
    if (rightAddSubRes.ok === false) return rightAddSubRes;

    // Apply comparison
    const compRes = applyComparisonOp(op, currentValue, rightAddSubRes.value);
    if (compRes.ok === false) return compRes;
    currentValue = compRes.value;
  }

  return ok(currentValue);
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
        j++;
      }
      if (depth !== 0) return err("Invalid numeric input");
      // j now points just after the matching ')'
      const sub = tokens.slice(i + 1, j - 1);
      if (sub.length === 0) return err("Invalid numeric input");
      const reducedSub = reduceParentheses(sub);
      if (reducedSub.ok === false) return reducedSub;
      const valRes = evalTokensToNumber(reducedSub.value);
      if (valRes.ok === false) return valRes;
      out.push({ type: "num", value: valRes.value });
      i = j;
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
