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

function findMatchingBrace(tokens: Token[], start: number): number {
  if (
    !tokens[start] ||
    tokens[start].type !== "punct" ||
    tokens[start].value !== "{"
  )
    return -1;
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === "punct") {
      if (tk.value === "{") depth++;
      else if (tk.value === "}") {
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

interface CaseParseResult {
  nextIndex: number;
  matched?: number;
}

function parseCaseAt(
  sub: Token[],
  i: number,
  matchVal: number,
  braceEnd: number,
  env: Map<string, Binding>
): Result<CaseParseResult, string> {
  const patTok = sub[i + 1];
  if (!patTok || patTok.type !== "num") return err("Invalid numeric input");
  const arrowTok = sub[i + 2];
  if (!arrowTok || arrowTok.type !== "punct" || arrowTok.value !== "=>")
    return err("Invalid numeric input");
  const exprStart = i + 3;
  const semi = indexUntilSemicolon(sub, exprStart);
  if (semi > braceEnd) return err("Invalid numeric input");
  const exprTokens = sub.slice(exprStart, semi);
  if (matchVal === patTok.value) {
    const exprRes = evalExprWithEnv(exprTokens, env);
    if (isErr(exprRes)) return err(exprRes.error);
    return ok({ nextIndex: semi + 1, matched: exprRes.value });
  }
  return ok({ nextIndex: semi + 1 });
}

function parseDefaultAt(
  sub: Token[],
  i: number,
  braceEnd: number,
  env: Map<string, Binding>
): Result<CaseParseResult, string> {
  const arrowTok = sub[i + 1];
  if (!arrowTok || arrowTok.type !== "punct" || arrowTok.value !== "=>")
    return err("Invalid numeric input");
  const exprStart = i + 2;
  const semi = indexUntilSemicolon(sub, exprStart);
  if (semi > braceEnd) return err("Invalid numeric input");
  const exprTokens = sub.slice(exprStart, semi);
  const exprRes = evalExprWithEnv(exprTokens, env);
  if (isErr(exprRes)) return err(exprRes.error);
  return ok({ nextIndex: semi + 1, matched: exprRes.value });
}

function evalInlineMatchToNumToken(
  tokens: Token[],
  start: number,
  env: Map<string, Binding>
): Result<InlineIfResult, string> {
  // tokens[start] === 'match'
  const sub = tokens.slice(start);
  if (sub.length === 0 || sub[0].type !== "ident" || sub[0].value !== "match")
    return err("Invalid numeric input");

  // expect '(' after match
  if (!sub[1] || sub[1].type !== "paren" || sub[1].value !== "(")
    return err("Invalid numeric input");
  const condEnd = findMatchingParen(sub, 1);
  if (condEnd === -1) return err("Invalid numeric input");
  const condTokens = sub.slice(2, condEnd);
  const condRes = evalExprWithEnv(condTokens, env);
  if (isErr(condRes)) return err(condRes.error);
  const matchVal = condRes.value;

  // expect '{' after condEnd
  const braceIdx = condEnd + 1;
  if (
    !sub[braceIdx] ||
    sub[braceIdx].type !== "punct" ||
    sub[braceIdx].value !== "{"
  )
    return err("Invalid numeric input");
  const braceEnd = findMatchingBrace(sub, braceIdx);
  if (braceEnd === -1) return err("Invalid numeric input");

  // parse cases between braceIdx+1 and braceEnd-1
  const matchRes = findMatchResultInBlock(
    sub,
    braceIdx + 1,
    braceEnd,
    matchVal,
    env
  );
  if (isErr(matchRes)) return err(matchRes.error);
  const matched = matchRes.value;
  if (matched === undefined) return err("Invalid numeric input");
  const consumed = braceEnd + 1; // tokens consumed within sub
  return ok({ token: { type: "num", value: matched }, consumed });
}

function handleParseResult(
  r: Result<CaseParseResult, string>,
  prevMatched: number | undefined
): Result<CaseParseResult, string> {
  if (isErr(r)) return err(r.error);
  const { nextIndex, matched: m } = r.value;
  const matchedVal =
    m !== undefined && prevMatched === undefined ? m : prevMatched;
  return ok({ nextIndex, matched: matchedVal });
}

function findMatchResultInBlock(
  sub: Token[],
  startIdx: number,
  braceEnd: number,
  matchVal: number,
  env: Map<string, Binding>
): Result<number | undefined, string> {
  let i = startIdx;
  let matched: number | undefined = undefined;
  while (i < braceEnd) {
    const tk = sub[i];
    if (tk.type === "ident" && tk.value === "case") {
      const r = parseCaseAt(sub, i, matchVal, braceEnd, env);
      const handled = handleParseResult(r, matched);
      if (isErr(handled)) return err(handled.error);
      matched = handled.value.matched;
      i = handled.value.nextIndex;
    } else if (tk.type === "ident" && tk.value === "default") {
      const r = parseDefaultAt(sub, i, braceEnd, env);
      const handled = handleParseResult(r, matched);
      if (isErr(handled)) return err(handled.error);
      matched = handled.value.matched;
      i = handled.value.nextIndex;
    } else {
      i++;
    }
  }
  return ok(matched);
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
      } else if (t.value === "match") {
        const inlineRes = evalInlineMatchToNumToken(tokens, i, env);
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
  let parenDepth = 0;
  let braceDepth = 0;
  while (j < tokensArr.length) {
    const tk = tokensArr[j];
    if (tk.type === "paren") {
      parenDepth += tk.value === "(" ? 1 : -1;
    } else if (tk.type === "punct") {
      if (tk.value === "{") braceDepth++;
      else if (tk.value === "}") braceDepth--;
      else if (tk.value === ";" && parenDepth === 0 && braceDepth === 0)
        return j;
    }
    j++;
  }
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

interface IdentPunctResult {
  name: string;
  punct: string;
}

function getIdentAndPunct(
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

function processAssignment(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const ip = getIdentAndPunct(tokensArr, idx);
  if (isErr(ip)) return err(ip.error);
  const { name, punct } = ip.value;
  if (punct !== "=") return err("Invalid numeric input");

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

function processCompoundAssignment(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const opTok = tokensArr[idx + 1];
  if (!opTok || opTok.type !== "punct") return err("Invalid numeric input");
  const op = opTok.value;
  if (!["+=", "-=", "*=", "/=", "%="].includes(op)) return err("Invalid numeric input");

  const ip = getIdentAndPunct(tokensArr, idx);
  if (isErr(ip)) return err(ip.error);
  const { name } = ip.value;

  const binding = envMap.get(name);
  if (!binding) return err("Undefined variable");
  // compound assignment requires existing value (read-modify-write) and mutability
  if (binding.value === undefined) return err("Uninitialized variable");
  if (!binding.mutable) return err("Cannot assign to immutable variable");

  const cur = idx + 2;
  const evalRes = evalExprUntilSemicolon(tokensArr, cur, envMap);
  if (isErr(evalRes)) return err(evalRes.error);
  let { value: rhs, nextIndex } = evalRes.value;

  const lhs = binding.value as number;
  const res = computeCompoundResult(op, lhs, rhs);
  if (isErr(res)) return err(res.error);
  let newVal = res.value;

  if (binding.typeName === "I32") newVal = Math.trunc(newVal);
  binding.value = newVal;
  envMap.set(name, binding);
  return ok({ nextIndex, value: newVal });
}

function findStatementEnd(tokens: Token[], start: number): number {
  const t = tokens[start];
  if (t && t.type === "ident" && t.value === "if") {
    const condParenIdx = start + 1;
    if (!tokens[condParenIdx] || tokens[condParenIdx].type !== "paren")
      return -1;
    const condEndInner = findMatchingParen(tokens, condParenIdx);
    if (condEndInner === -1) return -1;
    const elseIdxInner = findTopLevelElseIndex(tokens, condEndInner + 1);
    if (elseIdxInner === -1) return -1;
    const elseEndInner = findStatementEnd(tokens, elseIdxInner + 1);
    return elseEndInner;
  }
  return indexUntilSemicolon(tokens, start);
}

interface IfHeader {
  condTokens: Token[];
  condEnd: number;
  elseIdx: number;
}

function parseIfHeader(
  tokensArr: Token[],
  idx: number
): Result<IfHeader, string> {
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
  const elseIdx = findTopLevelElseIndex(tokensArr, condEnd + 1);
  if (elseIdx === -1) return err("Invalid numeric input");
  return ok({ condTokens, condEnd, elseIdx });
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

  function tryAssignment(
    tokensArr: Token[],
    idx: number,
    envMap: Map<string, Binding>
  ): Result<StatementResult, string> | undefined {
    const t = tokensArr[idx];
    if (
      t &&
      t.type === "ident" &&
      tokensArr[idx + 1] &&
      tokensArr[idx + 1].type === "punct"
    ) {
      const op = tokensArr[idx + 1].value;
      if (op === "=") return processAssignment(tokensArr, idx, envMap);
      if (["+=", "-=", "*=", "/=", "%="].includes(op as any))
        return processCompoundAssignment(tokensArr, idx, envMap);
    }
    return undefined;
  }

  // assignment or compound-assignment: ident <punct> ...
  const assignRes = tryAssignment(tokensArr, idx, envMap);
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
