import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Expr, Statement } from "./parser.ts";

type Binding = { mutable: boolean; value: unknown };

type State = { returnValue: unknown; returned: boolean };

function evalExpr(expr: Expr, bindings: Map<string, Binding>): Result<unknown> {
  if ("literal" in expr) {
    const value =
      typeof expr.literal === "boolean" ? (expr.literal ? 1 : 0) : expr.literal;
    return { ok: true, value };
  }
  if ("identifier" in expr) {
    const binding = bindings.get(expr.identifier);
    if (!binding)
      return fail({
        kind: "UndeclaredVariable",
        name: expr.identifier,
        position: expr.position,
      });
    return { ok: true, value: binding.value };
  }
  const { op, left, right } = expr.binary;
  const l = evalExpr(left, bindings);
  if (!l.ok) return l;
  const r = evalExpr(right, bindings);
  if (!r.ok) return r;
  const value =
    op === "||"
      ? l.value === 1 || r.value === 1
        ? 1
        : 0
      : op === "&&"
        ? l.value === 1 && r.value === 1
          ? 1
          : 0
        : (l.value as number) < (r.value as number)
          ? 1
          : 0;
  return { ok: true, value };
}

function execStatement(
  item: Statement,
  bindings: Map<string, Binding>,
  state: State,
): Result<unknown> {
  if (state.returned)
    return fail({ kind: "CodeAfterReturn", position: item.position });
  if ("declaration" in item) {
    const { name, mutable, expr } = item.declaration;
    const value = evalExpr(expr, bindings);
    if (!value.ok) return value;
    if (bindings.has(name))
      return fail({
        kind: "DuplicateDeclaration",
        name,
        position: item.declaration.position,
      });
    bindings.set(name, { mutable, value: value.value });
  } else if ("return" in item) {
    const value = evalExpr(item.return.expr, bindings);
    if (!value.ok) return value;
    state.returnValue = value.value;
    state.returned = true;
  } else if ("assignment" in item) {
    const { name, op, expr } = item.assignment;
    const binding = bindings.get(name);
    if (!binding)
      return fail({
        kind: "UndeclaredVariable",
        name,
        position: item.assignment.position,
      });
    if (!binding.mutable)
      return fail({
        kind: "ImmutableReassignment",
        name,
        position: item.assignment.position,
      });
    const value = evalExpr(expr, bindings);
    if (!value.ok) return value;
    binding.value =
      op === "+="
        ? (binding.value as number) + (value.value as number)
        : value.value;
  } else {
    return fail({ kind: "UnsupportedExpression", position: item.position });
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
    } else if ("if" in item) {
      if (state.returned)
        return fail({ kind: "CodeAfterReturn", position: item.position });
      const condition = evalExpr(item.if.condition, bindings);
      if (!condition.ok) return condition;
      const branch =
        condition.value === 1 ? item.if.thenBlock : item.if.elseBlock;
      if (branch) {
        const result = execStatements(branch, bindings, state);
        if (!result.ok) return result;
      }
    } else if ("while" in item) {
      if (state.returned)
        return fail({ kind: "CodeAfterReturn", position: item.position });
      while (!state.returned) {
        const condition = evalExpr(item.while.condition, bindings);
        if (!condition.ok) return condition;
        if (condition.value !== 1) break;
        const result = execStatements(item.while.body, bindings, state);
        if (!result.ok) return result;
      }
    } else {
      const result = execStatement(item, bindings, state);
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
