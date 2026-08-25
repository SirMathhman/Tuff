import type { Result } from "./errors.ts";
import type { Expr, Statement } from "./parser/index.ts";

export type Value = number | boolean;

type Binding = { value: Value };

type State = { returnValue: Value | undefined; returned: boolean };

type Signal = "break" | "continue" | undefined;

function evalExpr(expr: Expr, bindings: Map<string, Binding>): Value {
  if ("literal" in expr) return expr.literal;
  if ("grouped" in expr) return evalExpr(expr.grouped, bindings);
  if ("identifier" in expr) return bindings.get(expr.identifier)!.value;
  const { op, left, right } = expr.binary;
  const l = evalExpr(left, bindings);
  const r = evalExpr(right, bindings);
  return op === "||"
    ? l === true || r === true
    : op === "&&"
      ? l === true && r === true
      : op === "<"
        ? (l as number) < (r as number)
        : op === "+"
          ? (l as number) + (r as number)
          : op === "-"
            ? (l as number) - (r as number)
            : op === "*"
              ? (l as number) * (r as number)
              : l === r;
}

function execStatement(
  item: Statement,
  bindings: Map<string, Binding>,
  state: State,
): Signal {
  if ("break" in item) return "break";
  if ("continue" in item) return "continue";
  if ("declaration" in item) {
    const { name, expr } = item.declaration;
    bindings.set(name, { value: evalExpr(expr, bindings) });
  } else if ("return" in item) {
    state.returnValue = evalExpr(item.return.expr, bindings);
    state.returned = true;
  } else if ("assignment" in item) {
    const { name, op, expr } = item.assignment;
    const binding = bindings.get(name)!;
    const value = evalExpr(expr, bindings);
    if (op === "+=")
      binding.value = (binding.value as number) + (value as number);
    else binding.value = value;
  }
  return undefined;
}

function execStatements(
  statements: Statement[],
  bindings: Map<string, Binding>,
  state: State,
): Signal {
  for (const item of statements) {
    if (state.returned) return undefined;
    if ("block" in item) {
      const signal = execStatements(item.block, new Map(bindings), state);
      if (signal) return signal;
    } else if ("if" in item) {
      const condition = evalExpr(item.if.condition, bindings);
      const branch = condition === true ? item.if.thenBlock : item.if.elseBlock;
      if (branch) {
        const signal = execStatements(branch, new Map(bindings), state);
        if (signal) return signal;
      }
    } else if ("while" in item) {
      while (
        !state.returned &&
        evalExpr(item.while.condition, bindings) === true
      ) {
        const signal = execStatements(item.while.body, new Map(bindings), state);
        if (signal === "break") break;
        if (signal === "continue") continue;
      }
    } else if ("match" in item) {
      const scrutinee = evalExpr(item.match.scrutinee, bindings);
      for (const matchCase of item.match.cases) {
        const matched =
          matchCase.pattern.kind === "wildcard"
            ? true
            : matchCase.pattern.value === scrutinee;
        if (matched) {
          const signal = execStatements(matchCase.block, new Map(bindings), state);
          if (signal) return signal;
          break;
        }
      }
    } else {
      const signal = execStatement(item, bindings, state);
      if (signal) return signal;
    }
  }
  return undefined;
}

export function interpret(statements: Statement[]): Result<Value | undefined> {
  const bindings = new Map<string, Binding>();
  const state: State = { returnValue: undefined, returned: false };
  execStatements(statements, bindings, state);
  return { ok: true, value: state.returned ? state.returnValue : undefined };
}
