import type { Token } from "./tokenize";
import { Result, err, ok } from "./result";

interface ComparisonOperandResult {
  value: number;
  nextIdx: number;
}

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

function applyLogicalOp(
  op: string,
  lhs: number,
  rhs: number
): Result<number, string> {
  if (op === "&&") return ok(lhs !== 0 && rhs !== 0 ? 1 : 0);
  if (op === "||") return ok(lhs !== 0 || rhs !== 0 ? 1 : 0);
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

function evalComparisonOperand(
  tokens: Token[],
  startIdx: number
): Result<ComparisonOperandResult, string> {
  // Collect tokens until the next comparison or logical operator
  const operandTokens: Token[] = [];
  let i = startIdx;
  while (
    i < tokens.length &&
    tokens[i].type !== "comp" &&
    tokens[i].type !== "logop"
  ) {
    operandTokens.push(tokens[i]);
    i++;
  }

  if (operandTokens.length === 0) return err("Invalid numeric input");

  // Evaluate the operand
  const rightFolded = foldMultiplication(operandTokens);
  if (rightFolded.ok === false) return rightFolded;
  const rightAddSubRes = evalAddSub(rightFolded.value);
  if (rightAddSubRes.ok === false) return rightAddSubRes;

  return ok({ value: rightAddSubRes.value, nextIdx: i });
}

interface LogicalOpResult {
  value: number;
  nextIdx: number;
}

function evalLogicalOperator(
  tokens: Token[],
  currentValue: number,
  opIdx: number
): Result<LogicalOpResult, string> {
  const logicalOp = tokens[opIdx].value as unknown as string;
  let i = opIdx + 1;

  const rhsTokens: Token[] = [];
  while (i < tokens.length && tokens[i].type !== "logop") {
    rhsTokens.push(tokens[i]);
    i++;
  }

  if (rhsTokens.length === 0) return err("Invalid numeric input");
  const rhsRes = evalTokensToNumber(rhsTokens);
  if (rhsRes.ok === false) return rhsRes;

  const logRes = applyLogicalOp(logicalOp, currentValue, rhsRes.value);
  if (logRes.ok === false) return logRes;

  return ok({ value: logRes.value, nextIdx: i });
}

function evalComparisonOperator(
  tokens: Token[],
  currentValue: number,
  opIdx: number
): Result<LogicalOpResult, string> {
  const op = tokens[opIdx].value as unknown as string;
  const operandRes = evalComparisonOperand(tokens, opIdx + 1);
  if (operandRes.ok === false) return operandRes;

  const compRes = applyComparisonOp(op, currentValue, operandRes.value.value);
  if (compRes.ok === false) return compRes;

  return ok({ value: compRes.value, nextIdx: operandRes.value.nextIdx });
}

function evalTokensToNumber(tokens: Token[]): Result<number, string> {
  // Evaluate initial arithmetic expression before any comparisons/logical ops
  const arithmeticTokens: Token[] = [];
  let i = 0;
  while (
    i < tokens.length &&
    tokens[i].type !== "comp" &&
    tokens[i].type !== "logop"
  ) {
    arithmeticTokens.push(tokens[i]);
    i++;
  }

  const folded = foldMultiplication(arithmeticTokens);
  if (folded.ok === false) return folded;
  const addSubRes = evalAddSub(folded.value);
  if (addSubRes.ok === false) return addSubRes;

  if (i >= tokens.length) return ok(addSubRes.value);

  let currentValue = addSubRes.value;
  while (i < tokens.length) {
    const opRes =
      tokens[i].type === "logop"
        ? evalLogicalOperator(tokens, currentValue, i)
        : evalComparisonOperator(tokens, currentValue, i);

    if (opRes.ok === false) return opRes;
    currentValue = opRes.value.value;
    i = opRes.value.nextIdx;
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
