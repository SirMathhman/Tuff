import type { EvaluateError, Result } from "./errors.ts";

type Binding = { mutable: boolean; value: unknown };

function fail<T>(error: EvaluateError): Result<T> {
  return { ok: false, error };
}

function tokenize(input: string): Result<string[]> {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /\w/.test(input.charAt(j))) j++;
      tokens.push(input.slice(i, j));
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[\d.]/.test(input.charAt(j))) j++;
      tokens.push(input.slice(i, j));
      i = j;
    } else if (ch === "=" || ch === ";" || ch === "{" || ch === "}") {
      tokens.push(ch);
      i++;
    } else {
      return fail({ kind: "UnexpectedCharacter", ch, position: i });
    }
  }
  return { ok: true, value: tokens };
}

type Statement = { block: Statement[] } | { stmt: string[] };

function groupStatements(tokens: string[]): Result<Statement[]> {
  const statements: Statement[] = [];
  let current: string[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token === "{") {
      if (current.length !== 0) return fail({ kind: "UnbalancedBrace" });
      depth++;
      statements.push({ block: [] });
    } else if (token === "}") {
      depth--;
      if (depth < 0) return fail({ kind: "UnbalancedBrace" });
    } else if (token === ";") {
      if (current.length === 0) return fail({ kind: "EmptyStatement" });
      if (depth === 0) {
        statements.push({ stmt: current });
        current = [];
      } else {
        const block = statements[statements.length - 1];
        if (!block || "stmt" in block) return fail({ kind: "UnbalancedBrace" });
        block.block.push({ stmt: current });
        current = [];
      }
    } else {
      current.push(token);
    }
  }
  if (depth !== 0) return fail({ kind: "UnbalancedBrace" });
  if (current.length !== 0) return fail({ kind: "MissingTerminator" });
  return { ok: true, value: statements };
}

function evalExpr(
  tokens: string[],
  bindings: Map<string, Binding>,
): Result<unknown> {
  if (tokens.length !== 1) return fail({ kind: "UnsupportedExpression" });
  const token = tokens[0];
  if (token === undefined) return fail({ kind: "UnsupportedExpression" });
  if (/^\d+(\.\d+)?$/.test(token)) return { ok: true, value: Number(token) };
  const binding = bindings.get(token);
  if (!binding) return fail({ kind: "UndeclaredVariable", name: token });
  return { ok: true, value: binding.value };
}

function execStatement(
  stmt: string[],
  bindings: Map<string, Binding>,
  state: { returnValue: unknown; returned: boolean },
): Result<unknown> {
  if (state.returned) return fail({ kind: "CodeAfterReturn" });
  if (stmt[0] === "let") {
    let idx = 1;
    let mutable = false;
    if (stmt[idx] === "mut") {
      mutable = true;
      idx++;
    }
    const name = stmt[idx];
    if (!name || ["let", "mut", "return"].includes(name))
      return fail({
        kind: "ExpectedToken",
        expected: "variable name",
        found: name,
      });
    if (stmt[idx + 1] !== "=")
      return fail({
        kind: "ExpectedToken",
        expected: "'='",
        found: stmt[idx + 1],
      });
    const value = evalExpr(stmt.slice(idx + 2), bindings);
    if (!value.ok) return value;
    if (bindings.has(name)) return fail({ kind: "DuplicateDeclaration", name });
    bindings.set(name, { mutable, value: value.value });
  } else if (stmt[0] === "return") {
    const value = evalExpr(stmt.slice(1), bindings);
    if (!value.ok) return value;
    state.returnValue = value.value;
    state.returned = true;
  } else {
    const name = stmt[0];
    if (name === undefined) return fail({ kind: "EmptyStatement" });
    if (stmt[1] !== "=")
      return fail({ kind: "ExpectedToken", expected: "'='", found: stmt[1] });
    const binding = bindings.get(name);
    if (!binding) return fail({ kind: "UndeclaredVariable", name });
    if (!binding.mutable) return fail({ kind: "ImmutableReassignment", name });
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
      const result = execStatement(item.stmt, bindings, state);
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
