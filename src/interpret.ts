import { tokenize, Token } from "./tokenize";
import { evalLeftToRight } from "./evalLeftToRight";
import { Result, ok, err, isOk, isErr } from "./result";

interface Binding {
  value: number;
  mutable: boolean;
}

function evalExprWithEnv(tokens: Token[], env: Map<string, Binding>) {
  // Replace identifier tokens with numbers from env
  const substituted: Token[] = [];
  for (const t of tokens) {
    if (t.type === "ident") {
      const b = env.get(t.value);
      if (b === undefined) return err("Undefined variable");
      substituted.push({ type: "num", value: b.value });
    } else if (t.type === "punct") {
      return err("Invalid numeric input");
    } else {
      substituted.push(t);
    }
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

  if (
    !tokensArr[cur] ||
    tokensArr[cur].type !== "punct" ||
    tokensArr[cur].value !== "="
  )
    return err("Invalid numeric input");
  cur++;

  const evalRes = evalExprUntilSemicolon(tokensArr, cur, envMap);
  if (isErr(evalRes)) return err(evalRes.error);
  let { value: val, nextIndex: nextIdx } = evalRes.value;
  if (typeName === "I32") val = Math.trunc(val);
  envMap.set(name, { value: val, mutable });
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
  if (!binding.mutable) return err("Cannot assign to immutable variable");

  const cur = idx + 2;
  const evalRes = evalExprUntilSemicolon(tokensArr, cur, envMap);
  if (isErr(evalRes)) return err(evalRes.error);
  const { value: val, nextIndex } = evalRes.value;
  binding.value = val;
  envMap.set(name, binding);
  return ok({ nextIndex, value: val });
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
  let i = 0;
  let lastVal: number | undefined = undefined;

  while (i < tokens.length) {
    const res = processStatement(tokens, i, env);
    if (isErr(res)) return err(res.error);
    const { nextIndex, value } = res.value;
    if (value !== undefined) lastVal = value;
    i = nextIndex;
  }

  if (lastVal === undefined) return err("Invalid numeric input");
  return ok(lastVal);
}
