import type { Node } from "./ast.ts";
import { invalidInput, type EvalError } from "./errors.ts";
import type { Result } from "./result.ts";

type Type = "int" | "float" | "bool" | "unknown";

type Scope = {
  types: Record<string, Type>;
  mutable: Set<string>;
  loopDepth: number;
};

function checkNode(
  node: Node,
  scope: Scope,
  input: string,
): Result<Type, EvalError> {
  const fail = (reason: string): Result<Type, EvalError> => ({
    ok: false,
    error: invalidInput(input, reason, node.span),
  });
  switch (node.type) {
    case "number":
      return { ok: true, value: node.kind };
    case "bool":
      return { ok: true, value: "bool" };
    case "var": {
      const bound = scope.types[node.name];
      if (bound === undefined) return fail(`unbound variable: ${node.name}`);
      return { ok: true, value: bound };
    }
    case "binary":
    case "compare":
    case "logical": {
      const l = checkNode(node.lhs, scope, input);
      if (!l.ok) return l;
      const r = checkNode(node.rhs, scope, input);
      if (!r.ok) return r;
      if (node.type === "binary" && (l.value === "bool" || r.value === "bool"))
        return fail("arithmetic requires numeric operands, got bool");
      if (
        node.type === "compare" &&
        node.op !== "==" &&
        node.op !== "!=" &&
        (l.value === "bool" || r.value === "bool")
      )
        return fail(
          "relational comparison requires numeric operands, got bool",
        );
      return {
        ok: true,
        value: node.type === "binary" ? "float" : "bool",
      };
    }
    case "unary": {
      const operand = checkNode(node.operand, scope, input);
      if (!operand.ok) return operand;
      return { ok: true, value: node.op === "!" ? "bool" : "float" };
    }
    case "let": {
      const value = checkNode(node.value, scope, input);
      if (!value.ok) return value;
      scope.types[node.name] = value.value;
      if (node.mutable) scope.mutable.add(node.name);
      return { ok: true, value: "float" };
    }
    case "assign": {
      if (!scope.mutable.has(node.name))
        return fail(`cannot reassign immutable: ${node.name}`);
      const value = checkNode(node.value, scope, input);
      if (!value.ok) return value;
      const existing = scope.types[node.name];
      if (
        existing !== undefined &&
        existing !== "unknown" &&
        value.value !== "unknown" &&
        existing !== value.value &&
        !(existing === "float" && value.value === "int")
      )
        return fail(
          `type mismatch: cannot assign ${value.value} to ${existing} variable: ${node.name}`,
        );
      return { ok: true, value: "float" };
    }
    case "if":
      return checkIf(node, scope, input);
    case "block": {
      if (node.inExpression) {
        const last = node.statements[node.statements.length - 1];
        if (last && (last.type === "let" || last.type === "assign"))
          return fail("block must end with an expression");
      }
      const child: Scope = node.inExpression
        ? {
            types: { ...scope.types },
            mutable: new Set(scope.mutable),
            loopDepth: scope.loopDepth,
          }
        : scope;
      let value: Type = "float";
      for (const statement of node.statements) {
        const s = checkNode(statement, child, input);
        if (!s.ok) return s;
        value = s.value;
      }
      return { ok: true, value };
    }
    case "loop":
    case "break":
      return checkLoopOrBreak(node, scope, input, fail);
  }
}

function checkIf(
  node: Extract<Node, { type: "if" }>,
  scope: Scope,
  input: string,
): Result<Type, EvalError> {
  const cond = checkNode(node.cond, scope, input);
  if (!cond.ok) return cond;
  const then = checkNode(node.then, scope, input);
  if (!then.ok) return then;
  const els = checkNode(node.else, scope, input);
  if (!els.ok) return els;
  return {
    ok: true,
    value: then.value === els.value ? then.value : "unknown",
  };
}

function checkLoopOrBreak(
  node: Extract<Node, { type: "loop" | "break" }>,
  scope: Scope,
  input: string,
  fail: (reason: string) => Result<Type, EvalError>,
): Result<Type, EvalError> {
  if (node.type === "break") {
    if (scope.loopDepth === 0) return fail("break outside of a loop");
    const value = checkNode(node.value, scope, input);
    if (!value.ok) return value;
    return { ok: true, value: value.value };
  }
  const child: Scope = {
    types: { ...scope.types },
    mutable: new Set(scope.mutable),
    loopDepth: scope.loopDepth + 1,
  };
  const body = checkNode(node.body, child, input);
  if (!body.ok) return body;
  return { ok: true, value: body.value };
}

export function typecheck(
  statements: Node[],
  input: string,
): Result<true, EvalError> {
  const scope: Scope = {
    types: {},
    mutable: new Set<string>(),
    loopDepth: 0,
  };
  for (const statement of statements) {
    const s = checkNode(statement, scope, input);
    if (!s.ok) return s;
  }
  return { ok: true, value: true };
}
