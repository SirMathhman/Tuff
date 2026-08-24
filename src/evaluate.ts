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
    } else if (ch === "=" || ch === ";") {
      tokens.push(ch);
      i++;
    } else {
      return fail({ kind: "UnexpectedCharacter", ch, position: i });
    }
  }
  return { ok: true, value: tokens };
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

export function evaluate(input: string): Result<unknown> {
  if (input === "") return { ok: true, value: 0 };
  const tokensResult = tokenize(input);
  if (!tokensResult.ok) return tokensResult;

  const statements: string[][] = [];
  let current: string[] = [];
  for (const token of tokensResult.value) {
    if (token === ";") {
      if (current.length === 0) return fail({ kind: "EmptyStatement" });
      statements.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length !== 0) return fail({ kind: "MissingTerminator" });

  const bindings = new Map<string, Binding>();
  let returnValue: unknown;
  let returned = false;

  for (const stmt of statements) {
    if (returned) return fail({ kind: "CodeAfterReturn" });
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
      if (bindings.has(name))
        return fail({ kind: "DuplicateDeclaration", name });
      bindings.set(name, { mutable, value: value.value });
    } else if (stmt[0] === "return") {
      const value = evalExpr(stmt.slice(1), bindings);
      if (!value.ok) return value;
      returnValue = value.value;
      returned = true;
    } else {
      const name = stmt[0];
      if (name === undefined) return fail({ kind: "EmptyStatement" });
      if (stmt[1] !== "=")
        return fail({ kind: "ExpectedToken", expected: "'='", found: stmt[1] });
      const binding = bindings.get(name);
      if (!binding) return fail({ kind: "UndeclaredVariable", name });
      if (!binding.mutable)
        return fail({ kind: "ImmutableReassignment", name });
      const value = evalExpr(stmt.slice(2), bindings);
      if (!value.ok) return value;
      binding.value = value.value;
    }
  }
  return { ok: true, value: returned ? returnValue : undefined };
}
