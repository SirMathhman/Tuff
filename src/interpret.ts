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

interface ProcessResult {
  lastVal?: number;
}

function processStatementsTokens(
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

function findMatchingParen(tokens: Token[], start: number): number {
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

function findTopLevelElseIndex(tokens: Token[], start: number): number {
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
  // tokens should start with `if`
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

function evalExprWithEnv(tokens: Token[], env: Map<string, Binding>) {
  // If the whole expression is wrapped in outer parentheses, strip them to expose `if` at top-level
  const stripped = stripOuterParens(tokens);
  if (
    stripped.length > 0 &&
    stripped[0].type === "ident" &&
    stripped[0].value === "if"
  ) {
    return evalIfExpression(stripped, env);
  }

  // Replace identifier tokens with numbers from env; support boolean literals and inline `if` (consumes remainder)
  const substRes = substituteTokens(tokens, env);
  if (isErr(substRes)) return err(substRes.error);
  return evalLeftToRight(substRes.value);
}

// Top-level helper types & functions (extracted from interpret to reduce function length)
interface StatementResult {
  nextIndex: number;
  value?: number;
}

interface TypeParseResult {
  typeName?: string;
  nextIndex: number;
}

interface ExpressionEvalResult {
  value: number;
  nextIndex: number;
}

interface WhileBodyParseResult {
  bodyTokens: Token[];
  nextIndex: number;
}

function parseOptionalType(
  tokensArr: Token[],
  cur: number
): Result<TypeParseResult, string> {
  if (
    tokensArr[cur] &&
    tokensArr[cur].type === "punct" &&
    tokensArr[cur].value === ":"
  ) {
    cur++;
    const typeTok = tokensArr[cur];
    if (!typeTok || typeTok.type !== "ident")
      return err("Invalid numeric input");
    return ok({ typeName: typeTok.value, nextIndex: cur + 1 });
  }
  return ok({ nextIndex: cur });
}

function processLetStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  let cur = idx + 1;
  // optional `mut` keyword
  let mutable = false;
  const maybeTok = tokensArr[cur];
  if (maybeTok && maybeTok.type === "ident" && maybeTok.value === "mut") {
    mutable = true;
    cur++;
  }

  const nameTok = tokensArr[cur];
  if (!nameTok || nameTok.type !== "ident") return err("Invalid numeric input");
  const name = nameTok.value;
  cur++;

  const typeRes = parseOptionalType(tokensArr, cur);
  if (isErr(typeRes)) return err(typeRes.error);
  const { typeName, nextIndex } = typeRes.value;
  cur = nextIndex;

  if (!tokensArr[cur] || tokensArr[cur].type !== "punct")
    return err("Invalid numeric input");

  // allow declaration without initializer: `let x : I32;`
  if (tokensArr[cur].value === ";") {
    envMap.set(name, { value: undefined, mutable, typeName });
    return ok({ nextIndex: cur + 1 });
  }

  if (tokensArr[cur].value !== "=") return err("Invalid numeric input");
  cur++;

  const evalRes = evalExprUntilSemicolon(
    tokensArr,
    cur,
    envMap,
    evalExprWithEnv
  );
  if (isErr(evalRes)) return err(evalRes.error);
  let { value: val, nextIndex: nextIdx } = evalRes.value;
  if (typeName === "I32") val = Math.trunc(val);
  envMap.set(name, { value: val, mutable, typeName });
  return ok({ nextIndex: nextIdx });
}

function processExpressionStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const start = idx;
  const j = indexUntilSemicolon(tokensArr, idx);
  const exprTokens = tokensArr.slice(start, j);
  const valRes = evalExprWithEnv(exprTokens, envMap);
  if (isErr(valRes)) return err(valRes.error);
  return ok({
    nextIndex:
      j + (j < tokensArr.length && tokensArr[j].type === "punct" ? 1 : 0),
    value: valRes.value,
  });
}

function validateConditionParens(
  tokens: Token[],
  start: number
): Result<number, string> {
  const condParenIdx = start + 1;
  if (!tokens[condParenIdx] || tokens[condParenIdx].type !== "paren")
    return err("");
  const condEndInner = findMatchingParen(tokens, condParenIdx);
  if (condEndInner === -1) return err("");
  return ok(condEndInner);
}

function findIfStatementEnd(tokens: Token[], start: number): number {
  const condRes = validateConditionParens(tokens, start);
  if (isErr(condRes)) return -1;
  const condEndInner = condRes.value;
  const elseIdxInner = findTopLevelElseIndex(tokens, condEndInner + 1);
  if (elseIdxInner === -1) return -1;
  return findStatementEnd(tokens, elseIdxInner + 1);
}

function findWhileStatementEnd(tokens: Token[], start: number): number {
  const condRes = validateConditionParens(tokens, start);
  if (isErr(condRes)) return -1;
  const condEndInner = condRes.value;
  const bodyStart = condEndInner + 1;
  if (bodyStart >= tokens.length) return -1;
  // Check if body is block or single statement
  if (tokens[bodyStart].type === "punct" && tokens[bodyStart].value === "{") {
    return findMatchingBrace(tokens, bodyStart);
  }
  return indexUntilSemicolon(tokens, bodyStart);
}

function findStatementEnd(tokens: Token[], start: number): number {
  const t = tokens[start];
  if (t && t.type === "ident" && t.value === "if") {
    return findIfStatementEnd(tokens, start);
  }
  if (t && t.type === "ident" && t.value === "while") {
    return findWhileStatementEnd(tokens, start);
  }
  return indexUntilSemicolon(tokens, start);
}

interface IfHeader {
  condTokens: Token[];
  condEnd: number;
  elseIdx: number;
}

interface ConditionHeader {
  condTokens: Token[];
  condEnd: number;
}

function parseConditionHeader(
  tokensArr: Token[],
  idx: number
): Result<ConditionHeader, string> {
  const condParenIdx = idx + 1;
  if (
    !tokensArr[condParenIdx] ||
    tokensArr[condParenIdx].type !== "paren" ||
    tokensArr[condParenIdx].value !== "("
  )
    return err("Invalid numeric input");
  const condEnd = findMatchingParen(tokensArr, condParenIdx);
  if (condEnd === -1) return err("Invalid numeric input");
  const condTokens = tokensArr.slice(condParenIdx + 1, condEnd);
  if (condTokens.length === 0) return err("Invalid numeric input");
  return ok({ condTokens, condEnd });
}

function parseIfHeader(
  tokensArr: Token[],
  idx: number
): Result<IfHeader, string> {
  const baseRes = parseConditionHeader(tokensArr, idx);
  if (isErr(baseRes)) return err(baseRes.error);
  const { condTokens, condEnd } = baseRes.value;
  const elseIdx = findTopLevelElseIndex(tokensArr, condEnd + 1);
  if (elseIdx === -1) return err("Invalid numeric input");
  return ok({ condTokens, condEnd, elseIdx });
}

function parseWhileHeader(
  tokensArr: Token[],
  idx: number
): Result<WhileHeader, string> {
  const res = parseConditionHeader(tokensArr, idx);
  if (isErr(res)) return err(res.error);
  return ok(res.value);
}

function processIfStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const headerRes = parseIfHeader(tokensArr, idx);
  if (isErr(headerRes)) return err(headerRes.error);
  const { condTokens, condEnd, elseIdx } = headerRes.value;

  // find semicolon or nested-if end that ends the else branch (may be at end of tokens)
  const elseEnd = findStatementEnd(tokensArr, elseIdx + 1);
  if (elseEnd === -1) return err("Invalid numeric input");

  const thenTokens = tokensArr.slice(condEnd + 1, elseIdx);
  // include the terminating semicolon in elseTokens if present so inner statements parse correctly
  const elseTokens =
    elseEnd < tokensArr.length
      ? tokensArr.slice(elseIdx + 1, elseEnd + 1)
      : tokensArr.slice(elseIdx + 1, elseEnd);
  if (thenTokens.length === 0 || elseTokens.length === 0)
    return err("Invalid numeric input");

  const condRes = evalExprWithEnv(condTokens, envMap);
  if (isErr(condRes)) return err(condRes.error);
  const condVal = condRes.value;
  const chosen = condVal !== 0 ? thenTokens : elseTokens;
  const branchRes = processStatementsTokens(chosen, envMap);
  if (isErr(branchRes)) return err(branchRes.error);
  const nextIndex =
    elseEnd +
    (elseEnd < tokensArr.length && tokensArr[elseEnd].type === "punct" ? 1 : 0);
  return ok({ nextIndex, value: branchRes.value.lastVal });
}

function processBlockStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  if (
    !tokensArr[idx] ||
    tokensArr[idx].type !== "punct" ||
    tokensArr[idx].value !== "{"
  ) {
    return err("Invalid numeric input");
  }
  const braceEnd = findMatchingBrace(tokensArr, idx);
  if (braceEnd === -1) return err("Invalid numeric input");

  const blockTokens = tokensArr.slice(idx + 1, braceEnd);
  const blockRes = processStatementsTokens(blockTokens, envMap);
  if (isErr(blockRes)) return err(blockRes.error);

  return ok({ nextIndex: braceEnd + 1, value: blockRes.value.lastVal });
}

interface WhileHeader {
  condTokens: Token[];
  condEnd: number;
}



function findWhileStmtEnd(tokensArr: Token[], bodyStart: number): number {
  let stmtEnd = bodyStart;
  let depth = 0;
  while (stmtEnd < tokensArr.length) {
    const tk = tokensArr[stmtEnd];
    if (tk.type === "paren") {
      depth += tk.value === "(" ? 1 : -1;
    } else if (tk.type === "punct") {
      if (tk.value === "{") depth++;
      else if (tk.value === "}") depth--;
      else if (tk.value === ";" && depth === 0) {
        return stmtEnd + 1; // Include the semicolon
      }
    }
    stmtEnd++;
  }
  return stmtEnd;
}

function parseSingleStmtWhileBody(
  tokensArr: Token[],
  bodyStart: number
): Result<WhileBodyParseResult, string> {
  const stmtEnd = findWhileStmtEnd(tokensArr, bodyStart);
  const bodyTokens = tokensArr.slice(bodyStart, stmtEnd);
  return ok({ bodyTokens, nextIndex: stmtEnd });
}

function parseWhileBody(
  tokensArr: Token[],
  bodyStart: number
): Result<WhileBodyParseResult, string> {
  // Check if body is a block or single statement
  if (
    tokensArr[bodyStart].type === "punct" &&
    tokensArr[bodyStart].value === "{"
  ) {
    // Block body
    const bodyEnd = findMatchingBrace(tokensArr, bodyStart);
    if (bodyEnd === -1) return err("Invalid numeric input");
    const bodyTokens = tokensArr.slice(bodyStart + 1, bodyEnd);
    return ok({ bodyTokens, nextIndex: bodyEnd + 1 });
  } else {
    // Single statement body
    return parseSingleStmtWhileBody(tokensArr, bodyStart);
  }
}

function executeWhileLoop(
  bodyTokens: Token[],
  condTokens: Token[],
  envMap: Map<string, Binding>
): Result<void, string> {
  const MAX_ITERATIONS = 10000;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    const condRes = evalExprWithEnv(condTokens, envMap);
    if (isErr(condRes)) return err(condRes.error);
    const condVal = condRes.value;

    if (condVal === 0) return ok(undefined);

    const bodyRes = processStatementsTokens(bodyTokens, envMap);
    if (isErr(bodyRes)) return err(bodyRes.error);

    iterations++;
  }

  return err("Loop exceeded maximum iterations");
}

function processWhileStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const headerRes = parseWhileHeader(tokensArr, idx);
  if (isErr(headerRes)) return err(headerRes.error);
  const { condTokens, condEnd } = headerRes.value;

  // Find body start and end
  const bodyStart = condEnd + 1;
  if (bodyStart >= tokensArr.length) return err("Invalid numeric input");

  const bodyRes = parseWhileBody(tokensArr, bodyStart);
  if (isErr(bodyRes)) return err(bodyRes.error);

  const { bodyTokens, nextIndex } = bodyRes.value;
  if (bodyTokens.length === 0) return err("Invalid numeric input");

  const execRes = executeWhileLoop(bodyTokens, condTokens, envMap);
  if (isErr(execRes)) return err(execRes.error);

  return ok({ nextIndex, value: undefined });
}

function processStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  // skip stray semicolons
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
    return processLetStatement(tokensArr, idx, envMap);

  if (t.type === "ident" && t.value === "if")
    return processIfStatement(tokensArr, idx, envMap);

  if (t.type === "ident" && t.value === "while")
    return processWhileStatement(tokensArr, idx, envMap);

  if (t.type === "punct" && t.value === "{")
    return processBlockStatement(tokensArr, idx, envMap);

  // assignment or compound-assignment: ident <punct> ...
  const assignRes = tryAssignment(tokensArr, idx, envMap, evalExprWithEnv);
  if (assignRes !== undefined) return assignRes;

  return processExpressionStatement(tokensArr, idx, envMap);
}

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric literal (fast path)
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== "") {
    return ok(numeric);
  }

  const tokensRes = tokenize(trimmed);
  if (isErr(tokensRes)) return err(tokensRes.error);
  const tokens = tokensRes.value;

  // Program-level evaluation supporting 'let', mutable bindings and ';'
  const env = new Map<string, Binding>();
  const progRes = processStatementsTokens(tokens, env);
  if (isErr(progRes)) return err(progRes.error);
  const lastVal = progRes.value.lastVal;
  if (lastVal === undefined) return err("Invalid numeric input");
  return ok(lastVal);
}
