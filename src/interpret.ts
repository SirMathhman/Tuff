import { tokenize, Token } from "./tokenize";
import { evalLeftToRight } from "./evalLeftToRight";
import { Result, ok, err, isOk, isErr } from "./result";

interface Binding {
  value?: number;
  mutable: boolean;
  typeName?: string;
}

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

interface InlineIfResult {
  token: Token;
  consumed: number;
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
  const substituted: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    let consumed = 1;
    if (t.type === "ident") {
      if (t.value === "true") {
        substituted.push({ type: "num", value: 1 });
      } else if (t.value === "false") {
        substituted.push({ type: "num", value: 0 });
      } else if (t.value === "if") {
        const inlineRes = evalInlineIfToNumToken(tokens, i, env);
        if (isErr(inlineRes)) return err(inlineRes.error);
        substituted.push(inlineRes.value.token);
        consumed = inlineRes.value.consumed;
      } else {
        const b = env.get(t.value);
        if (b === undefined) return err("Undefined variable");
        if (b.value === undefined) return err("Uninitialized variable");
        substituted.push({ type: "num", value: b.value });
      }
    } else if (t.type === "punct") {
      return err("Invalid numeric input");
    } else {
      substituted.push(t);
    }
    i += consumed;
  }
  return evalLeftToRight(substituted);
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

function indexUntilSemicolon(tokensArr: Token[], start: number): number {
  let j = start;
  while (
    j < tokensArr.length &&
    !(tokensArr[j].type === "punct" && tokensArr[j].value === ";")
  )
    j++;
  return j;
}

function evalExprUntilSemicolon(
  tokensArr: Token[],
  cur: number,
  envMap: Map<string, Binding>
): Result<ExpressionEvalResult, string> {
  const j = indexUntilSemicolon(tokensArr, cur);
  if (j >= tokensArr.length) return err("Invalid numeric input");
  const exprTokens = tokensArr.slice(cur, j);
  const valRes = evalExprWithEnv(exprTokens, envMap);
  if (isErr(valRes)) return err(valRes.error);
  return ok({ value: valRes.value, nextIndex: j + 1 });
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

  const evalRes = evalExprUntilSemicolon(tokensArr, cur, envMap);
  if (isErr(evalRes)) return err(evalRes.error);
  let { value: val, nextIndex: nextIdx } = evalRes.value;
  if (typeName === "I32") val = Math.trunc(val);
  envMap.set(name, { value: val, mutable, typeName });
  return ok({ nextIndex: nextIdx, value: val });
}

function processExpressionStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const start = idx;
  let j = idx;
  while (
    j < tokensArr.length &&
    !(tokensArr[j].type === "punct" && tokensArr[j].value === ";")
  )
    j++;
  const exprTokens = tokensArr.slice(start, j);
  const valRes = evalExprWithEnv(exprTokens, envMap);
  if (isErr(valRes)) return err(valRes.error);
  return ok({
    nextIndex:
      j + (j < tokensArr.length && tokensArr[j].type === "punct" ? 1 : 0),
    value: valRes.value,
  });
}

function processAssignment(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  // tokensArr[idx] is the identifier name
  const nameTok = tokensArr[idx];
  if (!nameTok || nameTok.type !== "ident") return err("Invalid numeric input");
  const name = nameTok.value;
  const eqTok = tokensArr[idx + 1];
  if (!eqTok || eqTok.type !== "punct" || eqTok.value !== "=")
    return err("Invalid numeric input");

  const binding = envMap.get(name);
  if (!binding) return err("Undefined variable");
  // allow assignment if variable is mutable OR it is uninitialized (first initialization)
  if (!binding.mutable && binding.value !== undefined)
    return err("Cannot assign to immutable variable");

  const cur = idx + 2;
  const evalRes = evalExprUntilSemicolon(tokensArr, cur, envMap);
  if (isErr(evalRes)) return err(evalRes.error);
  let { value: val, nextIndex } = evalRes.value;
  if (binding.typeName === "I32") val = Math.trunc(val);
  binding.value = val;
  envMap.set(name, binding);
  return ok({ nextIndex, value: val });
}

function findStatementEnd(tokens: Token[], start: number): number {
  const t = tokens[start];
  if (t && t.type === "ident" && t.value === "if") {
    const condParenIdx = start + 1;
    if (!tokens[condParenIdx] || tokens[condParenIdx].type !== "paren") return -1;
    const condEndInner = findMatchingParen(tokens, condParenIdx);
    if (condEndInner === -1) return -1;
    const elseIdxInner = findTopLevelElseIndex(tokens, condEndInner + 1);
    if (elseIdxInner === -1) return -1;
    const elseEndInner = findStatementEnd(tokens, elseIdxInner + 1);
    return elseEndInner;
  }
  return indexUntilSemicolon(tokens, start);
}

function processIfStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  // parse if header (condition and its top-level else index)
  interface IfHeader { condTokens: Token[]; condEnd: number; elseIdx: number }
  function parseIfHeader(tokensArr: Token[], idx: number): Result<IfHeader, string> {
    const condParenIdx = idx + 1;
    if (!tokensArr[condParenIdx] || tokensArr[condParenIdx].type !== "paren" || tokensArr[condParenIdx].value !== "(")
      return err("Invalid numeric input");
    const condEnd = findMatchingParen(tokensArr, condParenIdx);
    if (condEnd === -1) return err("Invalid numeric input");
    const condTokens = tokensArr.slice(condParenIdx + 1, condEnd);
    if (condTokens.length === 0) return err("Invalid numeric input");
    const elseIdx = findTopLevelElseIndex(tokensArr, condEnd + 1);
    if (elseIdx === -1) return err("Invalid numeric input");
    return ok({ condTokens, condEnd, elseIdx });
  }

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

  // assignment: ident '=' ...
  if (
    t.type === "ident" &&
    tokensArr[idx + 1] &&
    tokensArr[idx + 1].type === "punct" &&
    tokensArr[idx + 1].value === "="
  )
    return processAssignment(tokensArr, idx, envMap);

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
