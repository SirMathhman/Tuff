import type { Token, NumToken } from "./tokenize";
import { Result, err, ok, isErr } from "./result";

interface ComparisonOperandResult {
  value: number;
  nextIdx: number;
}

interface TokenNext {
  token: Token;
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

  // Prevent arithmetic on struct instances
  const lhsVal = lhs.value as number;
  const rhsVal = rhs.value as number;

  if (op === "*") {
    const numTok: NumToken = { type: "num", value: lhsVal * rhsVal };
    return ok(numTok);
  }
  if (op === "/") {
    if (rhsVal === 0) return err("Division by zero");
    const numTok: NumToken = { type: "num", value: lhsVal / rhsVal };
    return ok(numTok);
  }
  if (op === "%") {
    if (rhsVal === 0) return err("Division by zero");
    const numTok: NumToken = { type: "num", value: lhsVal % rhsVal };
    return ok(numTok);
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

function getResultValue(res: Result<TokenNext, string>): Result<TokenNext, string> {
  if (isErr(res)) return err(res.error);
  return ok(res.value);
}

function applyResultAndAdvance(res: Result<TokenNext, string>, out: Token[]): Result<number, string> {
  const v = getResultValue(res);
  if (isErr(v)) return err(v.error);
  out.push(v.value.token);
  return ok(v.value.nextIdx);
}

function processParenthesized(tokens: Token[], startIdx: number): Result<TokenNext, string> {
  let j = startIdx + 1;
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
  const sub = tokens.slice(startIdx + 1, j - 1);
  if (sub.length === 0) return err("Invalid numeric input");
  const reducedSub = reduceParentheses(sub);
  if (reducedSub.ok === false) return reducedSub;
  const valRes = evalTokensToNumber(reducedSub.value);
  if (valRes.ok === false) return valRes;
  const numTok: NumToken = { type: "num", value: valRes.value };
  const outObj: TokenNext = { token: numTok, nextIdx: j };
  return ok(outObj);
}

function processUnaryNot(tokens: Token[], startIdx: number): Result<TokenNext, string> {
  let i = startIdx;
  let notCount = 0;
  while (i < tokens.length && tokens[i].type === "not") {
    notCount++;
    i++;
  }

  if (i >= tokens.length) return err("Invalid numeric input");

  let operandVal: number | undefined = undefined;

  const next = tokens[i];
  if (next.type === "paren" && next.value === "(") {
    const subRes = processParenthesized(tokens, i);
    if (isErr(subRes)) return subRes;
    operandVal = (subRes as any).value.token.value;
    i = (subRes as any).value.nextIdx;
  } else if (
    next.type === "op" &&
    next.value === "-" &&
    tokens[i + 1] &&
    tokens[i + 1].type === "num"
  ) {
    operandVal = -tokens[i + 1].value;
    i += 2;
  } else if (next.type === "num") {
    operandVal = next.value;
    i++;
  } else {
    return err("Invalid numeric input");
  }

  const resultVal = notCount % 2 === 0 ? operandVal : operandVal === 0 ? 1 : 0;
  const numTok: NumToken = { type: "num", value: resultVal as number };
  const outObj: TokenNext = { token: numTok, nextIdx: i };
  return ok(outObj);
}
function reduceParentheses(tokens: Token[]): Result<Token[], string> {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if ((t.type === "paren" && t.value === "(") || t.type === "not") {
      const res =
        t.type === "paren" && t.value === "("
          ? processParenthesized(tokens, i)
          : processUnaryNot(tokens, i);
      const v = getResultValue(res);
      if (isErr(v)) return err(v.error);
      out.push(v.value.token);
      i = v.value.nextIdx;
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
