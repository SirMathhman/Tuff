import type { Result } from "./errors.ts";

type Binding = { mutable: boolean; value: unknown };

function failed(cause: unknown): Result<unknown> {
  return { ok: false, error: { kind: "EvaluationFailed", cause } };
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
      return {
        ok: false,
        error: {
          kind: "EvaluationFailed",
          cause: new SyntaxError(`unexpected character '${ch}'`),
        },
      };
    }
  }
  return { ok: true, value: tokens };
}

function evalExpr(
  tokens: string[],
  bindings: Map<string, Binding>,
): Result<unknown> {
  if (tokens.length !== 1)
    return failed(new SyntaxError("unsupported expression"));
  const token = tokens[0];
  if (token === undefined)
    return failed(new SyntaxError("unsupported expression"));
  if (/^\d+(\.\d+)?$/.test(token)) return { ok: true, value: Number(token) };
  const binding = bindings.get(token);
  if (!binding)
    return failed(new SyntaxError(`undeclared variable '${token}'`));
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
      if (current.length === 0)
        return failed(new SyntaxError("empty statement"));
      statements.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length !== 0)
    return failed(new SyntaxError("expected ';' at end of input"));

  const bindings = new Map<string, Binding>();
  let returnValue: unknown;
  let returned = false;

  for (const stmt of statements) {
    if (returned) return failed(new SyntaxError("code after return"));
    if (stmt[0] === "let") {
      let idx = 1;
      let mutable = false;
      if (stmt[idx] === "mut") {
        mutable = true;
        idx++;
      }
      const name = stmt[idx];
      if (!name || ["let", "mut", "return"].includes(name))
        return failed(new SyntaxError("expected variable name after 'let'"));
      if (stmt[idx + 1] !== "=") return failed(new SyntaxError("expected '='"));
      const value = evalExpr(stmt.slice(idx + 2), bindings);
      if (!value.ok) return value;
      if (bindings.has(name))
        return failed(new SyntaxError(`duplicate declaration of '${name}'`));
      bindings.set(name, { mutable, value: value.value });
    } else if (stmt[0] === "return") {
      const value = evalExpr(stmt.slice(1), bindings);
      if (!value.ok) return value;
      returnValue = value.value;
      returned = true;
    } else {
      const name = stmt[0];
      if (name === undefined) return failed(new SyntaxError("empty statement"));
      if (stmt[1] !== "=") return failed(new SyntaxError("expected '='"));
      const binding = bindings.get(name);
      if (!binding)
        return failed(new SyntaxError(`undeclared variable '${name}'`));
      if (!binding.mutable)
        return {
          ok: false,
          error: {
            kind: "ImmutableReassignment",
            cause: new Error(`cannot reassign immutable variable '${name}'`),
          },
        };
      const value = evalExpr(stmt.slice(2), bindings);
      if (!value.ok) return value;
      binding.value = value.value;
    }
  }
  return { ok: true, value: returned ? returnValue : undefined };
}
