import type { EvalError, Node } from "./ast.ts";
import type { Result } from "./result.ts";
import { evaluateAst } from "./evaluator.ts";
import { tokenize } from "./tokenizer.ts";

type ParserState = {
  tokens: string[];
  pos: number;
  fail: (reason: string) => Result<never, EvalError>;
};

function makeFail(input: string) {
  return (reason: string): Result<never, EvalError> => ({
    ok: false,
    error: {
      kind: "invalid_input",
      input,
      reason,
      hint: 'pass a valid arithmetic expression, e.g. "1 + 2 * 3"',
    },
  });
}

function parseComparison(state: ParserState): Result<Node, EvalError> {
  const lhs = parseExpr(state);
  if (!lhs.ok) return lhs;
  let node: Node = lhs.value;
  while (state.tokens[state.pos] === "==") {
    state.pos++;
    const rhs = parseExpr(state);
    if (!rhs.ok) return rhs;
    node = { type: "compare", lhs: node, rhs: rhs.value };
  }
  return { ok: true, value: node };
}

function parseExpr(state: ParserState): Result<Node, EvalError> {
  const lhs = parseTerm(state);
  if (!lhs.ok) return lhs;
  if (state.tokens[state.pos] !== "+" && state.tokens[state.pos] !== "-")
    return lhs;
  let node: Node = lhs.value;
  while (true) {
    const op = state.tokens[state.pos];
    if (op !== "+" && op !== "-") break;
    state.pos++;
    const rhs = parseTerm(state);
    if (!rhs.ok) return rhs;
    node = { type: "binary", op, lhs: node, rhs: rhs.value };
  }
  return { ok: true, value: node };
}

function parseLetBinding(state: ParserState): Result<Node, EvalError> {
  state.pos++;
  let mutable = false;
  if (state.tokens[state.pos] === "mut") {
    mutable = true;
    state.pos++;
  }
  const name = state.tokens[state.pos];
  if (name === undefined || name === ";")
    return state.fail("expected identifier");
  state.pos++;
  if (state.tokens[state.pos] !== "=") return state.fail("expected =");
  state.pos++;
  const value = parseExpr(state);
  if (!value.ok) return value;
  if (state.tokens[state.pos] !== ";") return state.fail("expected ;");
  state.pos++;
  return {
    ok: true,
    value: { type: "let", mutable, name, value: value.value },
  };
}

function parseStatement(state: ParserState): Result<Node, EvalError> {
  if (state.tokens[state.pos] === "let") return parseLetBinding(state);
  const name = state.tokens[state.pos];
  if (name !== undefined && state.tokens[state.pos + 1] === "=") {
    state.pos += 2;
    const value = parseExpr(state);
    if (!value.ok) return value;
    if (state.tokens[state.pos] !== ";") return state.fail("expected ;");
    state.pos++;
    return { ok: true, value: { type: "assign", name, value: value.value } };
  }
  return parseComparison(state);
}

function parseStatements(state: ParserState): Result<Node[], EvalError> {
  const statements: Node[] = [];
  while (
    state.tokens[state.pos] !== undefined &&
    state.tokens[state.pos] !== "}"
  ) {
    const s = parseStatement(state);
    if (!s.ok) return s;
    statements.push(s.value);
  }
  return { ok: true, value: statements };
}

function parseTerm(state: ParserState): Result<Node, EvalError> {
  const lhs = parseFactor(state);
  if (!lhs.ok) return lhs;
  if (state.tokens[state.pos] !== "*" && state.tokens[state.pos] !== "/")
    return lhs;
  let node: Node = lhs.value;
  while (true) {
    const op = state.tokens[state.pos];
    if (op !== "*" && op !== "/") break;
    state.pos++;
    const rhs = parseFactor(state);
    if (!rhs.ok) return rhs;
    node = { type: "binary", op, lhs: node, rhs: rhs.value };
  }
  return { ok: true, value: node };
}

function parseFactor(state: ParserState): Result<Node, EvalError> {
  const t = state.tokens[state.pos];
  if (t === "(") {
    state.pos++;
    const node = parseExpr(state);
    if (!node.ok) return node;
    if (state.tokens[state.pos] !== ")") return state.fail("expected )");
    state.pos++;
    return node;
  }
  if (t === "{") {
    state.pos++;
    const statements = parseStatements(state);
    if (!statements.ok) return statements;
    if (state.tokens[state.pos] !== "}") return state.fail("expected }");
    state.pos++;
    return {
      ok: true,
      value: { type: "block", statements: statements.value },
    };
  }
  if (t === undefined) return state.fail("unexpected end of input");
  if (t === "true") {
    state.pos++;
    return { ok: true, value: { type: "bool", value: true } };
  }
  if (t === "false") {
    state.pos++;
    return { ok: true, value: { type: "bool", value: false } };
  }
  if (/^[A-Za-z_]/.test(t)) {
    state.pos++;
    return { ok: true, value: { type: "var", name: t } };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return state.fail(`not a number: ${t}`);
  state.pos++;
  return { ok: true, value: { type: "number", value: n } };
}

export function evaluate(input: string): Result<number, EvalError> {
  const fail = makeFail(input);
  if (input.trim() === "") return { ok: true, value: 0 };
  const tokenized = tokenize(input);
  if (!tokenized.ok) return fail(tokenized.error.reason);
  const state: ParserState = { tokens: tokenized.value, pos: 0, fail };
  const statements = parseStatements(state);
  if (!statements.ok) return statements;
  if (state.pos < state.tokens.length)
    return fail(`unexpected token: ${state.tokens[state.pos] ?? ""}`);
  return evaluateAst(statements.value, input);
}
