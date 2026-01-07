import { tokenize, Token } from "./tokenize";
import { evalLeftToRight } from "./evalLeftToRight";
import { Result, ok, err, isErr } from "./result";
import {
  Binding,
  InlineIfResult,
  FunctionBinding,
  evalInlineMatchToNumToken,
} from "./matchEval";
import { tryAssignment } from "./assignmentEval";
import { findMatchingBrace, findMatching } from "./commonUtils";
import {
  evaluateFieldAccess,
  evaluateStructInstantiation,
} from "./utils/structEval";
import { splitTopLevelCommaSeparated } from "./utils/splitTopLevel";
import {
  processLetStatement,
  processExpressionStatement,
  processIfStatement,
  processBlockStatement,
  processWhileStatement,
  processFunctionStatement,
  processStructStatement,
  StatementResult,
} from "./statements";

interface ProcessResult {
  lastVal?: number;
}

export function findMatchingParen(tokens: Token[], start: number): number {
  return findMatching(tokens, start, "paren", "(", ")");
}

function stripOuterParens(tokens: Token[]): Token[] {
  let t = tokens;
  let changed = true;
  while (changed) {
    changed = false;
    if (
      t.length >= 2 &&
      t[0].type === "paren" &&
      t[t.length - 1].type === "paren"
    ) {
      const match = findMatchingParen(t, 0);
      if (match === t.length - 1) {
        t = t.slice(1, t.length - 1);
        changed = true;
      }
    }
  }
  return t;
}

export function findTopLevelElseIndex(tokens: Token[], start: number): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === "paren") {
      depth += tk.value === "(" ? 1 : -1;
    } else if (tk.type === "ident" && tk.value === "else" && depth === 0) {
      return i;
    }
  }
  return -1;
}

function evalInlineIfToNumToken(
  tokens: Token[],
  start: number,
  env: Map<string, Binding>
): Result<InlineIfResult, string> {
  const subTokens = stripOuterParens(tokens.slice(start));
  if (
    subTokens.length === 0 ||
    subTokens[0].type !== "ident" ||
    subTokens[0].value !== "if"
  )
    return err("Invalid numeric input");
  const ifRes = evalIfExpression(subTokens, env);
  if (isErr(ifRes)) return err(ifRes.error);
  return ok({
    token: { type: "num", value: ifRes.value },
    consumed: tokens.length - start,
  });
}

function findThenIndex(tokens: Token[], startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < tokens.length; i++) {
    if (tokens[i].type === "paren") {
      depth += tokens[i].value === "(" ? 1 : -1;
    } else if (
      tokens[i].type === "ident" &&
      tokens[i].value === "then" &&
      depth === 0
    ) {
      return i;
    }
  }
  return -1;
}

export function evaluateIfBranch(
  condTokens: Token[],
  thenTokens: Token[],
  elseTokens: Token[],
  env: Map<string, Binding>,
  evalExprWithEnv: (
    tokens: Token[],
    env: Map<string, Binding>
  ) => Result<number, string>,
  processStatementsTokens: (
    tokens: Token[],
    env: Map<string, Binding>
  ) => Result<ProcessResult, string>
): Result<ProcessResult, string> {
  const condRes = evalExprWithEnv(condTokens, env);
  if (isErr(condRes)) return err(condRes.error);
  const condVal = condRes.value;
  const chosen = condVal !== 0 ? thenTokens : elseTokens;
  return processStatementsTokens(chosen, env);
}

function evalIfExpression(
  tokens: Token[],
  env: Map<string, Binding>
): Result<number, string> {
  // Handle both formats:
  // 1. if (condition) value1 else value2 - with parentheses, no 'then'
  // 2. if condition then value1 else value2 - no parentheses, with 'then'

  let condTokens: Token[];
  let valueStartIdx: number;

  const condParenIdx = 1;
  const hasParens =
    tokens[condParenIdx] &&
    tokens[condParenIdx].type === "paren" &&
    tokens[condParenIdx].value === "(";

  if (hasParens) {
    // Format 1: if (condition) value1 else value2
    const condEnd = findMatchingParen(tokens, condParenIdx);
    if (condEnd === -1) return err("Invalid numeric input");
    condTokens = tokens.slice(condParenIdx + 1, condEnd);
    valueStartIdx = condEnd + 1;
  } else {
    // Format 2: if condition then value1 else value2
    const thenIdx = findThenIndex(tokens, 1);
    if (thenIdx === -1) return err("Invalid numeric input");
    condTokens = tokens.slice(1, thenIdx);
    valueStartIdx = thenIdx + 1;
  }

  if (condTokens.length === 0) return err("Invalid numeric input");

  const elseIdx = findTopLevelElseIndex(tokens, valueStartIdx);
  if (elseIdx === -1) return err("Invalid numeric input");

  const thenTokens = tokens.slice(valueStartIdx, elseIdx);
  const elseTokens = tokens.slice(elseIdx + 1);
  if (thenTokens.length === 0 || elseTokens.length === 0)
    return err("Invalid numeric input");

  const branchRes = evaluateIfBranch(
    condTokens,
    thenTokens,
    elseTokens,
    env,
    evalExprWithEnv,
    processStatementsTokens
  );
  if (isErr(branchRes)) return err(branchRes.error);
  return ok(branchRes.value.lastVal ?? 0);
}

interface BlockExprResult {
  token: Token;
  consumed: number;
}

function evalBlockExpression(
  tokens: Token[],
  start: number,
  env: Map<string, Binding>
): Result<BlockExprResult, string> {
  if (
    !tokens[start] ||
    tokens[start].type !== "punct" ||
    tokens[start].value !== "{"
  ) {
    return err("Invalid numeric input");
  }
  const braceEnd = findMatchingBrace(tokens, start);
  if (braceEnd === -1) return err("Invalid numeric input");
  const blockTokens = tokens.slice(start + 1, braceEnd);
  if (blockTokens.length === 0)
    return err("Block must have a final expression");

  const blockRes = processStatementsTokens(blockTokens, env);
  if (isErr(blockRes)) return err(blockRes.error);

  const blockValue = blockRes.value.lastVal;
  if (blockValue === undefined)
    return err("Block must have a final expression");

  return ok({
    token: { type: "num", value: blockValue },
    consumed: braceEnd - start + 1,
  });
}

interface SubstituteResult {
  token: Token;
  consumed: number;
}

function evalArgs(
  argExprs: Token[][],
  env: Map<string, Binding>
): Result<number[], string> {
  const args: number[] = [];
  for (const argExpr of argExprs) {
    const argRes = evalExprWithEnv(argExpr, env);
    if (isErr(argRes)) return err(argRes.error);
    args.push(argRes.value);
  }
  return ok(args);
}

function evaluateFunctionCall(
  tokens: Token[],
  idx: number,
  env: Map<string, Binding>
): Result<SubstituteResult, string> {
  const nameTok = tokens[idx];
  if (nameTok.type !== "ident") return err("Invalid numeric input");
  const fnName = nameTok.value as string;

  const parenTok = tokens[idx + 1];
  if (!parenTok || parenTok.type !== "paren" || parenTok.value !== "(") {
    return err("Invalid numeric input");
  }

  const fnBinding = env.get(fnName);
  if (!fnBinding || fnBinding.type !== "fn") {
    return err("Undefined function");
  }

  const argEnd = findMatchingParen(tokens, idx + 1);
  if (argEnd === -1) return err("Invalid numeric input");

  const argTokens = tokens.slice(idx + 2, argEnd);

  const splitRes = splitTopLevelCommaSeparated(argTokens);
  if (isErr(splitRes)) return err(splitRes.error);
  const argExprs = splitRes.value;

  if (argExprs.length !== fnBinding.params.length) {
    return err("Invalid numeric input");
  }

  const argsRes = evalArgs(argExprs, env);
  if (isErr(argsRes)) return err(argsRes.error);
  const args = argsRes.value;

  const result = executeFunction(fnBinding, args, env);
  if (isErr(result)) return err(result.error);

  return ok({
    token: { type: "num", value: result.value },
    consumed: argEnd - idx + 1,
  });
}

function executeFunction(
  fnBinding: FunctionBinding,
  args: number[],
  parentEnv: Map<string, Binding>
): Result<number, string> {
  if (args.length !== fnBinding.params.length) {
    return err("Invalid numeric input");
  }

  const fnEnv = new Map(parentEnv);

  for (let i = 0; i < fnBinding.params.length; i++) {
    const param = fnBinding.params[i];
    let argVal = args[i];
    if (param.typeName === "I32") {
      argVal = Math.trunc(argVal);
    } else if (param.typeName === "Bool") {
      argVal = argVal !== 0 ? 1 : 0;
    }
    fnEnv.set(param.name, {
      type: "var",
      value: argVal,
      mutable: false,
      typeName: param.typeName,
    });
  }

  const bodyRes = processStatementsTokens(fnBinding.body, fnEnv);
  if (isErr(bodyRes)) return err(bodyRes.error);

  const result = bodyRes.value.lastVal;
  if (result === undefined) return err("Function must return a value");

  return ok(result);
}

function substituteKeywordIdent(
  tokens: Token[],
  idx: number,
  env: Map<string, Binding>
): Result<SubstituteResult, string> | undefined {
  const t = tokens[idx];
  if (t.type !== "ident") return undefined;

  if (t.value === "true") {
    return ok({ token: { type: "num", value: 1 }, consumed: 1 });
  }
  if (t.value === "false") {
    return ok({ token: { type: "num", value: 0 }, consumed: 1 });
  }
  if (t.value === "if") {
    return evalInlineIfToNumToken(tokens, idx, env);
  }
  if (t.value === "match") {
    return evalInlineMatchToNumToken(
      tokens,
      idx,
      env,
      findMatchingParen,
      evalExprWithEnv
    );
  }

  return undefined;
}

function substituteValueIdent(
  tokens: Token[],
  idx: number,
  env: Map<string, Binding>
): Result<SubstituteResult, string> {
  const t = tokens[idx];
  if (t.type !== "ident") return err("Invalid numeric input");

  const nextTok = tokens[idx + 1];

  if (nextTok && nextTok.type === "dot") {
    return evaluateFieldAccess(tokens, idx, idx + 1, env);
  }

  if (nextTok && nextTok.type === "punct" && nextTok.value === "{") {
    return evaluateStructInstantiation(
      tokens,
      idx,
      idx + 1,
      env,
      evalExprWithEnv
    );
  }

  if (nextTok && nextTok.type === "paren" && nextTok.value === "(") {
    return evaluateFunctionCall(tokens, idx, env);
  }

  const b = env.get(t.value as string);
  if (b === undefined) return err("Undefined variable");
  if (b.type !== "var") return err("Cannot use function as value");
  if (b.value === undefined) return err("Uninitialized variable");

  if (typeof b.value === "number") {
    return ok({ token: { type: "num", value: b.value }, consumed: 1 });
  }
  return ok({ token: { type: "struct", value: b.value }, consumed: 1 });
}

function substituteIdentToken(
  tokens: Token[],
  idx: number,
  env: Map<string, Binding>
): Result<SubstituteResult, string> {
  const keywordRes = substituteKeywordIdent(tokens, idx, env);
  if (keywordRes !== undefined) return keywordRes;

  return substituteValueIdent(tokens, idx, env);
}

function substituteTokens(
  tokens: Token[],
  env: Map<string, Binding>
): Result<Token[], string> {
  const substituted: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "ident") {
      const substRes = substituteIdentToken(tokens, i, env);
      if (isErr(substRes)) return err(substRes.error);
      substituted.push(substRes.value.token);
      i += substRes.value.consumed;
    } else if (t.type === "punct" && t.value === "{") {
      const blockRes = evalBlockExpression(tokens, i, env);
      if (isErr(blockRes)) return err(blockRes.error);
      substituted.push(blockRes.value.token);
      i += blockRes.value.consumed;
    } else {
      substituted.push(t);
      i++;
    }
  }
  return ok(substituted);
}

export function evalExprWithEnv(tokens: Token[], env: Map<string, Binding>) {
  const stripped = stripOuterParens(tokens);
  if (
    stripped.length > 0 &&
    stripped[0].type === "ident" &&
    stripped[0].value === "if"
  ) {
    return evalIfExpression(stripped, env);
  }

  const substRes = substituteTokens(tokens, env);
  if (isErr(substRes)) return err(substRes.error);
  return evalLeftToRight(substRes.value);
}

export function processStatementsTokens(
  tokens: Token[],
  env: Map<string, Binding>
): Result<ProcessResult, string> {
  let i = 0;
  let lastVal: number | undefined = undefined;
  while (i < tokens.length) {
    const res = processStatement(tokens, i, env);
    if (isErr(res)) return err(res.error);
    const { nextIndex, value } = res.value;
    if (value !== undefined) lastVal = value;
    i = nextIndex;
  }
  return ok({ lastVal });
}

function tryRouteStatement(
  t: Token | undefined,
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> | undefined {
  if (!t || t.type !== "ident") return undefined;

  switch (t.value) {
    case "let":
      return processLetStatement(tokensArr, idx, envMap, evalExprWithEnv);
    case "fn":
      return processFunctionStatement(tokensArr, idx, envMap);
    case "struct":
      return processStructStatement(tokensArr, idx, envMap);
    case "if":
      return processIfStatement(
        tokensArr,
        idx,
        envMap,
        evalExprWithEnv,
        processStatementsTokens
      );
    case "while":
      return processWhileStatement(
        tokensArr,
        idx,
        envMap,
        evalExprWithEnv,
        processStatementsTokens
      );
    default:
      return undefined;
  }
}

function tryBlockStatement(
  t: Token | undefined,
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> | undefined {
  if (t?.type === "punct" && t.value === "{")
    return processBlockStatement(
      tokensArr,
      idx,
      envMap,
      processStatementsTokens
    );
  return undefined;
}

function processStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  if (
    tokensArr[idx] &&
    tokensArr[idx].type === "punct" &&
    tokensArr[idx].value === ";"
  ) {
    return ok({ nextIndex: idx + 1 });
  }

  const t = tokensArr[idx];
  if (!t) return err("Invalid numeric input");

  const routed = tryRouteStatement(t, tokensArr, idx, envMap);
  if (routed !== undefined) return routed;

  const block = tryBlockStatement(t, tokensArr, idx, envMap);
  if (block !== undefined) return block;

  const assignRes = tryAssignment(tokensArr, idx, envMap, evalExprWithEnv);
  if (assignRes !== undefined) return assignRes;

  return processExpressionStatement(tokensArr, idx, envMap, evalExprWithEnv);
}

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== "") {
    return ok(numeric);
  }

  const tokensRes = tokenize(trimmed);
  if (isErr(tokensRes)) return err(tokensRes.error);
  const tokens = tokensRes.value;

  const env = new Map<string, Binding>();
  const progRes = processStatementsTokens(tokens, env);
  if (isErr(progRes)) return err(progRes.error);
  const lastVal = progRes.value.lastVal;
  if (lastVal === undefined) return err("Invalid numeric input");
  return ok(lastVal);
}
