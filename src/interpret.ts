import { tokenize, Token } from "./tokenize";
import { evalLeftToRight } from "./evalLeftToRight";
import { Result, ok, err, isErr } from "./result";
import {
  Binding,
  InlineIfResult,
  evalInlineMatchToNumToken,
} from "./matchEval";
import { evalExprUntilSemicolon, tryAssignment } from "./assignmentEval";
import { indexUntilSemicolon, findMatchingBrace } from "./commonUtils";
import {
  processLetStatement,
  processExpressionStatement,
  processIfStatement,
  processBlockStatement,
  processWhileStatement,
  StatementResult,
} from "./statements";

interface ProcessResult {
  lastVal?: number;
}

export function findMatchingParen(tokens: Token[], start: number): number {
  if (
    !tokens[start] ||
    tokens[start].type !== "paren" ||
    tokens[start].value !== "("
  )
    return -1;
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === "paren") {
      if (tk.value === "(") depth++;
      else if (tk.value === ")") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
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

function evalIfExpression(
  tokens: Token[],
  env: Map<string, Binding>
): Result<number, string> {
  const condParenIdx = 1;
  if (
    !tokens[condParenIdx] ||
    tokens[condParenIdx].type !== "paren" ||
    tokens[condParenIdx].value !== "("
  )
    return err("Invalid numeric input");
  const condEnd = findMatchingParen(tokens, condParenIdx);
  if (condEnd === -1) return err("Invalid numeric input");
  const condTokens = tokens.slice(condParenIdx + 1, condEnd);
  if (condTokens.length === 0) return err("Invalid numeric input");

  const elseIdx = findTopLevelElseIndex(tokens, condEnd + 1);
  if (elseIdx === -1) return err("Invalid numeric input");

  const thenTokens = tokens.slice(condEnd + 1, elseIdx);
  const elseTokens = tokens.slice(elseIdx + 1);
  if (thenTokens.length === 0 || elseTokens.length === 0)
    return err("Invalid numeric input");

  const condRes = evalExprWithEnv(condTokens, env);
  if (isErr(condRes)) return err(condRes.error);
  const condVal = condRes.value;
  const chosen = condVal !== 0 ? thenTokens : elseTokens;
  const branchRes = processStatementsTokens(chosen, env);
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

function substituteIdentToken(
  tokens: Token[],
  idx: number,
  env: Map<string, Binding>
): Result<SubstituteResult, string> {
  const t = tokens[idx];
  if (t.type !== "ident") return err("Invalid numeric input");

  if (t.value === "true") {
    return ok({ token: { type: "num", value: 1 }, consumed: 1 });
  } else if (t.value === "false") {
    return ok({ token: { type: "num", value: 0 }, consumed: 1 });
  } else if (t.value === "if") {
    const inlineRes = evalInlineIfToNumToken(tokens, idx, env);
    if (isErr(inlineRes)) return err(inlineRes.error);
    return ok({
      token: inlineRes.value.token,
      consumed: inlineRes.value.consumed,
    });
  } else if (t.value === "match") {
    const inlineRes = evalInlineMatchToNumToken(
      tokens,
      idx,
      env,
      findMatchingParen,
      evalExprWithEnv
    );
    if (isErr(inlineRes)) return err(inlineRes.error);
    return ok({
      token: inlineRes.value.token,
      consumed: inlineRes.value.consumed,
    });
  } else {
    const b = env.get(t.value);
    if (b === undefined) return err("Undefined variable");
    if (b.value === undefined) return err("Uninitialized variable");
    return ok({ token: { type: "num", value: b.value }, consumed: 1 });
  }
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

  if (t.type === "ident" && t.value === "let")
    return processLetStatement(tokensArr, idx, envMap, evalExprWithEnv);

  if (t.type === "ident" && t.value === "if")
    return processIfStatement(
      tokensArr,
      idx,
      envMap,
      evalExprWithEnv,
      processStatementsTokens
    );

  if (t.type === "ident" && t.value === "while")
    return processWhileStatement(
      tokensArr,
      idx,
      envMap,
      evalExprWithEnv,
      processStatementsTokens
    );

  if (t.type === "punct" && t.value === "{")
    return processBlockStatement(
      tokensArr,
      idx,
      envMap,
      processStatementsTokens
    );

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
