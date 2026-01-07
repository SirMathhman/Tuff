import { Token } from "./tokenize";
import { Result, ok, err, isErr } from "./result";
import { Binding, StructInstance } from "./matchEval";
import { evalExprUntilSemicolon, tryAssignment } from "./assignmentEval";
import { indexUntilSemicolon, findMatchingBrace } from "./commonUtils";
import { parseFunctionSignature } from "./functions";
import { parseStructDefinition } from "./structs";
import { evaluateStructInstantiation } from "./utils/structEval";
import {
  findMatchingParen,
  findTopLevelElseIndex,
  evaluateIfBranch,
} from "./interpret";

export interface StatementResult {
  nextIndex: number;
  value?: number;
}

interface ExprEvalFn {
  (tokens: Token[], env: Map<string, Binding>): Result<number, string>;
}

interface StmtProcessorFn {
  (tokens: Token[], env: Map<string, Binding>): Result<any, string>;
}

function tryProcessLetStructInstantiation(
  tokensArr: Token[],
  cur: number,
  name: string,
  mutable: boolean,
  typeName: string | undefined,
  envMap: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn
): Result<StatementResult, string> | undefined {
  if (!isStructInstantiation(tokensArr, cur)) return undefined;

  const braceIdx = cur + 1;
  const structRes = evaluateStructInstantiation(
    tokensArr,
    cur,
    braceIdx,
    envMap,
    evalExprWithEnv
  );
  if (isErr(structRes)) return err(structRes.error);

  const { token: structToken, consumed } = structRes.value;
  if (structToken.type !== "struct")
    return err("Expected struct instantiation");

  const instance: StructInstance = structToken.value;
  const nextIdx = cur + consumed;

  let finalIdx = nextIdx;
  if (
    tokensArr[nextIdx] &&
    tokensArr[nextIdx].type === "punct" &&
    tokensArr[nextIdx].value === ";"
  ) {
    finalIdx = nextIdx + 1;
  }

  envMap.set(name, { type: "var", value: instance, mutable, typeName });
  return ok({ nextIndex: finalIdx });
}

interface TypeParseResult {
  typeName?: string;
  nextIndex: number;
}

interface WhileBodyParseResult {
  bodyTokens: Token[];
  nextIndex: number;
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

interface WhileHeader {
  condTokens: Token[];
  condEnd: number;
}

interface LetHeaderParseResult {
  name: string;
  mutable: boolean;
  typeName: string | undefined;
  cur: number;
}

export function parseOptionalType(
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

function isStructInstantiation(tokensArr: Token[], cur: number): boolean {
  const nameTok = tokensArr[cur];
  const braceTok = tokensArr[cur + 1];
  return (
    nameTok &&
    nameTok.type === "ident" &&
    braceTok &&
    braceTok.type === "punct" &&
    braceTok.value === "{"
  );
}

function parseLetHeader(
  tokensArr: Token[],
  idx: number
): Result<LetHeaderParseResult, string> {
  let cur = idx + 1;
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
  return ok({ name, mutable, typeName, cur: nextIndex });
}

export function processLetStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn
): Result<StatementResult, string> {
  const headerRes = parseLetHeader(tokensArr, idx);
  if (isErr(headerRes)) return err(headerRes.error);
  const { name, mutable, typeName } = headerRes.value;
  let cur = headerRes.value.cur;

  if (!tokensArr[cur] || tokensArr[cur].type !== "punct")
    return err("Invalid numeric input");

  if (tokensArr[cur].value === ";") {
    envMap.set(name, { type: "var", value: undefined, mutable, typeName });
    return ok({ nextIndex: cur + 1 });
  }

  if (tokensArr[cur].value !== "=") return err("Invalid numeric input");
  cur++;

  const structStmt = tryProcessLetStructInstantiation(
    tokensArr,
    cur,
    name,
    mutable,
    typeName,
    envMap,
    evalExprWithEnv
  );
  if (structStmt !== undefined) return structStmt;

  // Normal numeric expression evaluation
  const evalRes = evalExprUntilSemicolon(
    tokensArr,
    cur,
    envMap,
    evalExprWithEnv
  );
  if (isErr(evalRes)) return err(evalRes.error);
  let { value: val, nextIndex: nextIdx } = evalRes.value;
  if (typeName === "I32") val = Math.trunc(val);
  envMap.set(name, { type: "var", value: val, mutable, typeName });
  return ok({ nextIndex: nextIdx });
}

export function processFunctionStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const parseRes = parseFunctionSignature(tokensArr, idx);
  if (isErr(parseRes)) return err(parseRes.error);

  const { name, params, returnType, bodyTokens, nextIndex } = parseRes.value;

  const fnBinding = {
    type: "fn" as const,
    params,
    returnType,
    body: bodyTokens,
  };

  envMap.set(name, fnBinding);
  return ok({ nextIndex });
}

export function processStructStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>
): Result<StatementResult, string> {
  const parseRes = parseStructDefinition(tokensArr, idx);
  if (isErr(parseRes)) return err(parseRes.error);

  const { name, fields, nextIndex } = parseRes.value;

  const structBinding = {
    type: "struct" as const,
    fields,
  };

  envMap.set(name, structBinding);
  return ok({ nextIndex });
}

export function processExpressionStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn
): Result<StatementResult, string> {
  const j = indexUntilSemicolon(tokensArr, idx);
  const exprTokens = tokensArr.slice(idx, j);
  if (exprTokens.length === 0) return err("Invalid numeric input");

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

function getConditionEnd(tokens: Token[], start: number): number {
  const condRes = validateConditionParens(tokens, start);
  if (isErr(condRes)) return -1;
  return condRes.value;
}

function findIfStatementEnd(tokens: Token[], start: number): number {
  const condEndInner = getConditionEnd(tokens, start);
  if (condEndInner === -1) return -1;
  const elseIdxInner = findTopLevelElseIndex(tokens, condEndInner + 1);
  if (elseIdxInner === -1) return -1;
  return findStatementEnd(tokens, elseIdxInner + 1);
}

function findWhileStatementEnd(tokens: Token[], start: number): number {
  const condEndInner = getConditionEnd(tokens, start);
  if (condEndInner === -1) return -1;
  const bodyStart = condEndInner + 1;
  if (bodyStart >= tokens.length) return -1;
  if (tokens[bodyStart].type === "punct" && tokens[bodyStart].value === "{") {
    return findMatchingBrace(tokens, bodyStart);
  }
  return indexUntilSemicolon(tokens, bodyStart);
}

export function findStatementEnd(tokens: Token[], start: number): number {
  const t = tokens[start];
  if (t && t.type === "ident" && t.value === "if") {
    return findIfStatementEnd(tokens, start);
  }
  if (t && t.type === "ident" && t.value === "while") {
    return findWhileStatementEnd(tokens, start);
  }
  return indexUntilSemicolon(tokens, start);
}

function findThenKeywordIndex(tokensArr: Token[], startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < tokensArr.length; i++) {
    if (tokensArr[i].type === "paren") {
      depth += tokensArr[i].value === "(" ? 1 : -1;
    } else if (
      tokensArr[i].type === "ident" &&
      tokensArr[i].value === "then" &&
      depth === 0
    ) {
      return i;
    }
  }
  return -1;
}

function parseConditionHeader(
  tokensArr: Token[],
  idx: number
): Result<ConditionHeader, string> {
  const condParenIdx = idx + 1;

  // Check if we have the format with parentheses: if (condition)
  if (
    tokensArr[condParenIdx] &&
    tokensArr[condParenIdx].type === "paren" &&
    tokensArr[condParenIdx].value === "("
  ) {
    // Format 1: if (condition) ...
    const condEnd = findMatchingParen(tokensArr, condParenIdx);
    if (condEnd === -1) return err("Invalid numeric input");
    const condTokens = tokensArr.slice(condParenIdx + 1, condEnd);
    if (condTokens.length === 0) return err("Invalid numeric input");
    return ok({ condTokens, condEnd });
  } else {
    // Format 2: if condition then ...
    const thenIdx = findThenKeywordIndex(tokensArr, idx + 1);
    if (thenIdx === -1) return err("Invalid numeric input");
    const condTokens = tokensArr.slice(idx + 1, thenIdx);
    if (condTokens.length === 0) return err("Invalid numeric input");
    // condEnd should point to the 'then' token so that condEnd + 1 skips it
    return ok({ condTokens, condEnd: thenIdx });
  }
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

export function processIfStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn,
  processStatementsTokens: StmtProcessorFn
): Result<StatementResult, string> {
  const headerRes = parseIfHeader(tokensArr, idx);
  if (isErr(headerRes)) return err(headerRes.error);
  const { condTokens, condEnd, elseIdx } = headerRes.value;

  const elseEnd = findStatementEnd(tokensArr, elseIdx + 1);
  if (elseEnd === -1) return err("Invalid numeric input");

  const thenTokens = tokensArr.slice(condEnd + 1, elseIdx);
  const elseTokens =
    elseEnd < tokensArr.length
      ? tokensArr.slice(elseIdx + 1, elseEnd + 1)
      : tokensArr.slice(elseIdx + 1, elseEnd);
  if (thenTokens.length === 0 || elseTokens.length === 0)
    return err("Invalid numeric input");

  const branchRes = evaluateIfBranch(
    condTokens,
    thenTokens,
    elseTokens,
    envMap,
    evalExprWithEnv,
    processStatementsTokens
  );
  if (isErr(branchRes)) return err(branchRes.error);
  const nextIndex =
    elseEnd +
    (elseEnd < tokensArr.length && tokensArr[elseEnd].type === "punct" ? 1 : 0);
  return ok({ nextIndex, value: branchRes.value.lastVal });
}

export function processBlockStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  processStatementsTokens: StmtProcessorFn
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
        return stmtEnd + 1;
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
  if (
    tokensArr[bodyStart].type === "punct" &&
    tokensArr[bodyStart].value === "{"
  ) {
    const bodyEnd = findMatchingBrace(tokensArr, bodyStart);
    if (bodyEnd === -1) return err("Invalid numeric input");
    const bodyTokens = tokensArr.slice(bodyStart + 1, bodyEnd);
    return ok({ bodyTokens, nextIndex: bodyEnd + 1 });
  } else {
    return parseSingleStmtWhileBody(tokensArr, bodyStart);
  }
}

function executeWhileLoop(
  bodyTokens: Token[],
  condTokens: Token[],
  envMap: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn,
  processStatementsTokens: StmtProcessorFn
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

export function processWhileStatement(
  tokensArr: Token[],
  idx: number,
  envMap: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn,
  processStatementsTokens: StmtProcessorFn
): Result<StatementResult, string> {
  const headerRes = parseWhileHeader(tokensArr, idx);
  if (isErr(headerRes)) return err(headerRes.error);
  const { condTokens, condEnd } = headerRes.value;

  const bodyStart = condEnd + 1;
  if (bodyStart >= tokensArr.length) return err("Invalid numeric input");

  const bodyRes = parseWhileBody(tokensArr, bodyStart);
  if (isErr(bodyRes)) return err(bodyRes.error);

  const { bodyTokens, nextIndex } = bodyRes.value;
  if (bodyTokens.length === 0) return err("Invalid numeric input");

  const execRes = executeWhileLoop(
    bodyTokens,
    condTokens,
    envMap,
    evalExprWithEnv,
    processStatementsTokens
  );
  if (isErr(execRes)) return err(execRes.error);

  return ok({ nextIndex, value: undefined });
}
