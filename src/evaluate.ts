import type { EvaluateError, Result } from "./errors.ts";

type Binding = { mutable: boolean; value: unknown };

type TokenKind = "number" | "identifier" | "keyword" | "punctuation";

type Token = { value: string; kind: TokenKind; position: number };

const KEYWORDS = new Set(["let", "mut", "return", "true", "false"]);

function fail<T>(error: EvaluateError): Result<T> {
  return { ok: false, error };
}

function tokenize(input: string): Result<Token[]> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /\w/.test(input.charAt(j))) j++;
      const value = input.slice(i, j);
      const kind: TokenKind = KEYWORDS.has(value) ? "keyword" : "identifier";
      tokens.push({ value, kind, position: i });
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[\d.]/.test(input.charAt(j))) j++;
      const value = input.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(value))
        return fail({ kind: "InvalidNumberLiteral", literal: value, position: i });
      tokens.push({ value, kind: "number", position: i });
      i = j;
    } else if (ch === "=" || ch === ";" || ch === "{" || ch === "}") {
      tokens.push({ value: ch, kind: "punctuation", position: i });
      i++;
    } else if (ch === "|" && input.charAt(i + 1) === "|") {
      tokens.push({ value: "||", kind: "punctuation", position: i });
      i += 2;
    } else {
      return fail({ kind: "UnexpectedCharacter", ch, position: i });
    }
  }
  return { ok: true, value: tokens };
}

type Statement =
  | { block: Statement[]; position: number }
  | { stmt: Token[]; position: number };

function groupStatements(tokens: Token[]): Result<Statement[]> {
  const statements: Statement[] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.value === "{") {
      if (current.length !== 0)
        return fail({ kind: "UnbalancedBrace", position: token.position });
      depth++;
      statements.push({ block: [], position: token.position });
    } else if (token.value === "}") {
      depth--;
      if (depth < 0)
        return fail({ kind: "UnbalancedBrace", position: token.position });
    } else if (token.value === ";") {
      if (current.length === 0)
        return fail({ kind: "EmptyStatement", position: token.position });
      if (depth === 0) {
        statements.push({ stmt: current, position: current[0]!.position });
        current = [];
      } else {
        const block = statements[statements.length - 1];
        if (!block || "stmt" in block)
          return fail({ kind: "UnbalancedBrace", position: token.position });
        block.block.push({ stmt: current, position: current[0]!.position });
        current = [];
      }
    } else {
      current.push(token);
    }
  }
  if (depth !== 0)
    return fail({
      kind: "UnbalancedBrace",
      position: tokens[tokens.length - 1]?.position ?? 0,
    });
  if (current.length !== 0)
    return fail({
      kind: "MissingTerminator",
      position: current[current.length - 1]!.position,
    });
  return { ok: true, value: statements };
}

function evalOperand(
  token: Token,
  bindings: Map<string, Binding>,
): Result<unknown> {
  if (token.kind === "number") return { ok: true, value: Number(token.value) };
  if (token.kind === "keyword") {
    if (token.value === "true") return { ok: true, value: 1 };
    if (token.value === "false") return { ok: true, value: 0 };
    return fail({ kind: "UnsupportedExpression", position: token.position });
  }
  if (token.kind !== "identifier")
    return fail({ kind: "UnsupportedExpression", position: token.position });
  const binding = bindings.get(token.value);
  if (!binding)
    return fail({
      kind: "UndeclaredVariable",
      name: token.value,
      position: token.position,
    });
  return { ok: true, value: binding.value };
}

function evalExpr(
  tokens: Token[],
  bindings: Map<string, Binding>,
): Result<unknown> {
  if (tokens.length === 0)
    return fail({ kind: "UnsupportedExpression", position: 0 });
  if (tokens.length === 1) {
    const token = tokens[0]!;
    return evalOperand(token, bindings);
  }
  if (tokens.length === 3 && tokens[1]?.value === "||") {
    const left = evalOperand(tokens[0]!, bindings);
    if (!left.ok) return left;
    const right = evalOperand(tokens[2]!, bindings);
    if (!right.ok) return right;
    return {
      ok: true,
      value: left.value === 1 || right.value === 1 ? 1 : 0,
    };
  }
  return fail({ kind: "UnsupportedExpression", position: tokens[0]!.position });
}

function execStatement(
  stmt: Token[],
  position: number,
  bindings: Map<string, Binding>,
  state: { returnValue: unknown; returned: boolean },
): Result<unknown> {
  if (state.returned) return fail({ kind: "CodeAfterReturn", position });
  if (stmt[0]?.value === "let") {
    let idx = 1;
    let mutable = false;
    if (stmt[idx]?.value === "mut") {
      mutable = true;
      idx++;
    }
    const nameToken = stmt[idx];
    if (
      !nameToken ||
      ["let", "mut", "return", "true", "false"].includes(nameToken.value)
    )
      return fail({
        kind: "ExpectedToken",
        expected: "variable name",
        found: nameToken?.value,
        position: nameToken?.position ?? position,
      });
    if (stmt[idx + 1]?.value !== "=")
      return fail({
        kind: "ExpectedToken",
        expected: "'='",
        found: stmt[idx + 1]?.value,
        position: stmt[idx + 1]?.position ?? position,
      });
    const value = evalExpr(stmt.slice(idx + 2), bindings);
    if (!value.ok) return value;
    if (bindings.has(nameToken.value))
      return fail({
        kind: "DuplicateDeclaration",
        name: nameToken.value,
        position: nameToken.position,
      });
    bindings.set(nameToken.value, { mutable, value: value.value });
  } else if (stmt[0]?.value === "return") {
    const value = evalExpr(stmt.slice(1), bindings);
    if (!value.ok) return value;
    state.returnValue = value.value;
    state.returned = true;
  } else {
    const nameToken = stmt[0];
    if (nameToken === undefined)
      return fail({ kind: "EmptyStatement", position });
    if (stmt[1]?.value !== "=")
      return fail({
        kind: "ExpectedToken",
        expected: "'='",
        found: stmt[1]?.value,
        position: stmt[1]?.position ?? position,
      });
    const binding = bindings.get(nameToken.value);
    if (!binding)
      return fail({
        kind: "UndeclaredVariable",
        name: nameToken.value,
        position: nameToken.position,
      });
    if (!binding.mutable)
      return fail({
        kind: "ImmutableReassignment",
        name: nameToken.value,
        position: nameToken.position,
      });
    const value = evalExpr(stmt.slice(2), bindings);
    if (!value.ok) return value;
    binding.value = value.value;
  }
  return { ok: true, value: undefined };
}

function execStatements(
  statements: Statement[],
  bindings: Map<string, Binding>,
  state: { returnValue: unknown; returned: boolean },
): Result<unknown> {
  for (const item of statements) {
    if ("block" in item) {
      const result = execStatements(item.block, bindings, state);
      if (!result.ok) return result;
    } else {
      const result = execStatement(item.stmt, item.position, bindings, state);
      if (!result.ok) return result;
    }
  }
  return { ok: true, value: undefined };
}

export function evaluate(input: string): Result<unknown> {
  if (input === "") return { ok: true, value: 0 };
  const tokensResult = tokenize(input);
  if (!tokensResult.ok) return tokensResult;
  const statementsResult = groupStatements(tokensResult.value);
  if (!statementsResult.ok) return statementsResult;

  const bindings = new Map<string, Binding>();
  const state = { returnValue: undefined, returned: false };
  const result = execStatements(statementsResult.value, bindings, state);
  if (!result.ok) return result;
  return { ok: true, value: state.returned ? state.returnValue : undefined };
}
