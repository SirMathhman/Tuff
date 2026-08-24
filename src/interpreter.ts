import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Token } from "./lexer.ts";
import type { Statement } from "./parser.ts";

type Binding = { mutable: boolean; value: unknown };

type State = { returnValue: unknown; returned: boolean };

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
  if (
    tokens.length === 3 &&
    (tokens[1]?.value === "||" || tokens[1]?.value === "&&")
  ) {
    const left = evalOperand(tokens[0]!, bindings);
    if (!left.ok) return left;
    const right = evalOperand(tokens[2]!, bindings);
    if (!right.ok) return right;
    const value =
      tokens[1]!.value === "||"
        ? left.value === 1 || right.value === 1
          ? 1
          : 0
        : left.value === 1 && right.value === 1
          ? 1
          : 0;
    return { ok: true, value };
  }
  return fail({ kind: "UnsupportedExpression", position: tokens[0]!.position });
}

function execStatement(
  stmt: Token[],
  position: number,
  bindings: Map<string, Binding>,
  state: State,
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
    if (nameToken === undefined) return fail({ kind: "EmptyStatement", position });
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
  state: State,
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

export function interpret(statements: Statement[]): Result<unknown> {
  const bindings = new Map<string, Binding>();
  const state: State = { returnValue: undefined, returned: false };
  const result = execStatements(statements, bindings, state);
  if (!result.ok) return result;
  return { ok: true, value: state.returned ? state.returnValue : undefined };
}
