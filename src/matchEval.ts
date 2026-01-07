import { Token } from "./tokenize";
import { Result, ok, err, isErr } from "./result";
import { indexUntilSemicolon, findMatchingBrace } from "./commonUtils";

export interface VarBinding {
  type: "var";
  value?: number;
  mutable: boolean;
  typeName?: string;
}

export interface FunctionParameter {
  name: string;
  typeName?: string;
}

export interface FunctionBinding {
  type: "fn";
  params: FunctionParameter[];
  returnType?: string;
  body: Token[];
}

export type Binding = VarBinding | FunctionBinding;

export interface InlineIfResult {
  token: Token;
  consumed: number;
}

interface CaseParseResult {
  nextIndex: number;
  matched?: number;
}

export type EvalExprFn = (
  tokens: Token[],
  env: Map<string, Binding>
) => Result<number, string>;

function parseCaseAt(
  sub: Token[],
  i: number,
  matchVal: number,
  braceEnd: number,
  env: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
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
  env: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
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

function handleCaseOrDefault(
  sub: Token[],
  i: number,
  braceEnd: number,
  matchVal: number,
  env: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn,
  isDefault: boolean
): Result<CaseParseResult, string> {
  if (isDefault) {
    return parseDefaultAt(sub, i, braceEnd, env, evalExprWithEnv);
  }
  return parseCaseAt(sub, i, matchVal, braceEnd, env, evalExprWithEnv);
}

function findMatchResultInBlock(
  sub: Token[],
  startIdx: number,
  braceEnd: number,
  matchVal: number,
  env: Map<string, Binding>,
  evalExprWithEnv: EvalExprFn
): Result<number | undefined, string> {
  let i = startIdx;
  let matched: number | undefined = undefined;
  while (i < braceEnd) {
    const tk = sub[i];
    if (
      tk.type === "ident" &&
      (tk.value === "case" || tk.value === "default")
    ) {
      const isDefault = tk.value === "default";
      const r = handleCaseOrDefault(
        sub,
        i,
        braceEnd,
        matchVal,
        env,
        evalExprWithEnv,
        isDefault
      );
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

export function evalInlineMatchToNumToken(
  tokens: Token[],
  start: number,
  env: Map<string, Binding>,
  findMatchingParen: (tokens: Token[], start: number) => number,
  evalExprWithEnv: EvalExprFn
): Result<InlineIfResult, string> {
  const sub = tokens.slice(start);
  if (sub.length === 0 || sub[0].type !== "ident" || sub[0].value !== "match")
    return err("Invalid numeric input");

  if (!sub[1] || sub[1].type !== "paren" || sub[1].value !== "(")
    return err("Invalid numeric input");
  const condEnd = findMatchingParen(sub, 1);
  if (condEnd === -1) return err("Invalid numeric input");
  const condTokens = sub.slice(2, condEnd);
  const condRes = evalExprWithEnv(condTokens, env);
  if (isErr(condRes)) return err(condRes.error);
  const matchVal = condRes.value;

  const braceIdx = condEnd + 1;
  if (
    !sub[braceIdx] ||
    sub[braceIdx].type !== "punct" ||
    sub[braceIdx].value !== "{"
  )
    return err("Invalid numeric input");
  const braceEnd = findMatchingBrace(sub, braceIdx);
  if (braceEnd === -1) return err("Invalid numeric input");

  const matchRes = findMatchResultInBlock(
    sub,
    braceIdx + 1,
    braceEnd,
    matchVal,
    env,
    evalExprWithEnv
  );
  if (isErr(matchRes)) return err(matchRes.error);
  const matched = matchRes.value;
  if (matched === undefined) return err("Invalid numeric input");
  const consumed = braceEnd + 1;
  return ok({ token: { type: "num", value: matched }, consumed });
}
