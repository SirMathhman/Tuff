import { Token } from "./tokenize";
import { Result, ok, err, isErr } from "./result";
import { indexUntilSemicolon } from "./commonUtils";
import { Binding } from "./matchEval";

interface StatementResult {
  nextIndex: number;
  value?: number;
}

interface ExpressionEvalResult {
  value: number;
  nextIndex: number;
}

interface IdentPunctResult {
  name: string;
  punct: string;
}

export type EvalExprFn = (
  tokens: Token[],
  env: Map<string, Binding>
) => Result<number, string>;

export function evalExprUntilSemicolon(
  tokensArr: Token[],
  cur: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<ExpressionEvalResult, string> {
  const j = indexUntilSemicolon(tokensArr, cur);
  if (j >= tokensArr.length) return err("Invalid numeric input");
  const exprTokens = tokensArr.slice(cur, j);
  const valRes = evalExprWithEnv(exprTokens, envMap);
  if (isErr(valRes)) return err(valRes.error);
  return ok({ value: valRes.value, nextIndex: j + 1 });
}

export function getIdentAndPunct(
  tokensArr: Token[],
  idx: number
): Result<IdentPunctResult, string> {
  const nameTok = tokensArr[idx];
  if (!nameTok || nameTok.type !== "ident") return err("Invalid numeric input");
  const punctTok = tokensArr[idx + 1];
  if (!punctTok || punctTok.type !== "punct")
    return err("Invalid numeric input");
  return ok({ name: nameTok.value, punct: punctTok.value });
}

function evalAndFetchResult(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<ExpressionEvalResult, string> {
  const cur = idx + 2;
  return evalExprUntilSemicolon(tokensArr, cur, envMap, evalExprWithEnv);
}

interface AssignmentParseResult {
  val: number;
  nextIndex: number;
}

function parseAssignmentValue(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<AssignmentParseResult, string> {
  const evalRes = evalAndFetchResult(tokensArr, idx, envMap, evalExprWithEnv);
  if (isErr(evalRes)) return err(evalRes.error);
  const { value: val, nextIndex } = evalRes.value;
  return ok({ val, nextIndex });
}

export function processAssignment(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<StatementResult, string> {
  const ip = getIdentAndPunct(tokensArr, idx);
  if (isErr(ip)) return err(ip.error);
  const { name, punct } = ip.value;
  if (punct !== "=") return err("Invalid numeric input");

  const binding = envMap.get(name);
  if (!binding) return err("Undefined variable");
  if (binding.type !== "var") return err("Cannot assign to function");
  if (!binding.mutable && binding.value !== undefined)
    return err("Cannot assign to immutable variable");

  const valRes = parseAssignmentValue(tokensArr, idx, envMap, evalExprWithEnv);
  if (isErr(valRes)) return err(valRes.error);
  let { val, nextIndex } = valRes.value;

  if (binding.typeName === "I32") val = Math.trunc(val);
  binding.value = val;
  envMap.set(name, binding);
  return ok({ nextIndex, value: val });
}

function computeCompoundResult(
  op: string,
  lhs: number,
  rhs: number
): Result<number, string> {
  if (op === "+=") return ok(lhs + rhs);
  if (op === "-=") return ok(lhs - rhs);
  if (op === "*=") return ok(lhs * rhs);
  if (op === "/=") {
    if (rhs === 0) return err("Division by zero");
    return ok(lhs / rhs);
  }
  if (op === "%=") {
    if (rhs === 0) return err("Division by zero");
    return ok(lhs % rhs);
  }
  return err("Invalid numeric input");
}

export function processCompoundAssignment(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<StatementResult, string> {
  const opTok = tokensArr[idx + 1];
  if (!opTok || opTok.type !== "punct") return err("Invalid numeric input");
  const op = opTok.value;
  if (!["+=", "-=", "*=", "/=", "%="].includes(op))
    return err("Invalid numeric input");

  const ip = getIdentAndPunct(tokensArr, idx);
  if (isErr(ip)) return err(ip.error);
  const { name } = ip.value;

  const binding = envMap.get(name);
  if (!binding) return err("Undefined variable");
  if (binding.type !== "var") return err("Cannot assign to function");
  if (binding.value === undefined) return err("Uninitialized variable");
  if (!binding.mutable) return err("Cannot assign to immutable variable");

  const valRes = parseAssignmentValue(tokensArr, idx, envMap, evalExprWithEnv);
  if (isErr(valRes)) return err(valRes.error);
  let { val: rhs, nextIndex } = valRes.value;

  const lhs = binding.value as number;
  const res = computeCompoundResult(op, lhs, rhs);
  if (isErr(res)) return err(res.error);
  let newVal = res.value;

  if (binding.typeName === "I32") newVal = Math.trunc(newVal);
  binding.value = newVal;
  envMap.set(name, binding);
  return ok({ nextIndex, value: newVal });
}

export function tryAssignment(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<StatementResult, string> | undefined {
  const t = tokensArr[idx];
  if (
    t &&
    t.type === "ident" &&
    tokensArr[idx + 1] &&
    tokensArr[idx + 1].type === "punct"
  ) {
    const op = tokensArr[idx + 1].value;
    if (op === "=")
      return processAssignment(tokensArr, idx, envMap, evalExprWithEnv);
    if (["+=", "-=", "*=", "/=", "%="].includes(op as any))
      return processCompoundAssignment(tokensArr, idx, envMap, evalExprWithEnv);
  }
  return undefined;
}
