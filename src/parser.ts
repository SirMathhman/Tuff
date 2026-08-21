import type { Node, Span } from "./ast.ts";
import { invalidInput, type EvalError } from "./errors.ts";
import type { Result } from "./result.ts";
import { tokenize, type Token } from "./tokenizer.ts";

type ParserState = {
  tokens: Token[];
  pos: number;
  fail: (reason: string) => Result<never, EvalError>;
};

function currentSpan(state: ParserState): Span {
  const t = state.tokens[state.pos];
  return t ? { start: t.start, end: t.end } : { start: 0, end: 0 };
}

function spanFrom(start: number, end: number): Span {
  return { start, end };
}

function spanOf(state: ParserState, from: number): Span {
  const first = state.tokens[from];
  const last = state.tokens[state.pos - 1];
  if (!first || !last) return { start: 0, end: 0 };
  return { start: first.start, end: last.end };
}

function parseOr(state: ParserState): Result<Node, EvalError> {
  const lhs = parseAnd(state);
  if (!lhs.ok) return lhs;
  let node: Node = lhs.value;
  while (state.tokens[state.pos]?.text === "||") {
    state.pos++;
    const rhs = parseAnd(state);
    if (!rhs.ok) return rhs;
    node = {
      type: "or",
      lhs: node,
      rhs: rhs.value,
      span: spanFrom(node.span.start, rhs.value.span.end),
    };
  }
  return { ok: true, value: node };
}

function parseAnd(state: ParserState): Result<Node, EvalError> {
  const lhs = parseComparison(state);
  if (!lhs.ok) return lhs;
  let node: Node = lhs.value;
  while (state.tokens[state.pos]?.text === "&&") {
    state.pos++;
    const rhs = parseComparison(state);
    if (!rhs.ok) return rhs;
    node = {
      type: "and",
      lhs: node,
      rhs: rhs.value,
      span: spanFrom(node.span.start, rhs.value.span.end),
    };
  }
  return { ok: true, value: node };
}

function parseComparison(state: ParserState): Result<Node, EvalError> {
  const lhs = parseExpr(state);
  if (!lhs.ok) return lhs;
  let node: Node = lhs.value;
  while (
    state.tokens[state.pos]?.text === "==" ||
    state.tokens[state.pos]?.text === ">" ||
    state.tokens[state.pos]?.text === ">=" ||
    state.tokens[state.pos]?.text === "<" ||
    state.tokens[state.pos]?.text === "<=" ||
    state.tokens[state.pos]?.text === "!="
  ) {
    const op = state.tokens[state.pos]?.text as
      "==" | "!=" | ">" | ">=" | "<" | "<=";
    state.pos++;
    const rhs = parseExpr(state);
    if (!rhs.ok) return rhs;
    const span = spanFrom(node.span.start, rhs.value.span.end);
    node = { type: "compare", op, lhs: node, rhs: rhs.value, span };
  }
  return { ok: true, value: node };
}

function parseExpr(state: ParserState): Result<Node, EvalError> {
  const lhs = parseTerm(state);
  if (!lhs.ok) return lhs;
  if (
    state.tokens[state.pos]?.text !== "+" &&
    state.tokens[state.pos]?.text !== "-"
  )
    return lhs;
  let node: Node = lhs.value;
  while (true) {
    const op = state.tokens[state.pos]?.text;
    if (op !== "+" && op !== "-") break;
    state.pos++;
    const rhs = parseTerm(state);
    if (!rhs.ok) return rhs;
    node = {
      type: "binary",
      op,
      lhs: node,
      rhs: rhs.value,
      span: spanFrom(node.span.start, rhs.value.span.end),
    };
  }
  return { ok: true, value: node };
}

function parseLetBinding(state: ParserState): Result<Node, EvalError> {
  const start = state.pos;
  state.pos++;
  let mutable = false;
  if (state.tokens[state.pos]?.text === "mut") {
    mutable = true;
    state.pos++;
  }
  const name = state.tokens[state.pos]?.text;
  if (name === undefined || name === ";")
    return state.fail("expected identifier");
  state.pos++;
  if (state.tokens[state.pos]?.text !== "=") return state.fail("expected =");
  state.pos++;
  const value = parseExpr(state);
  if (!value.ok) return value;
  if (state.tokens[state.pos]?.text !== ";") return state.fail("expected ;");
  state.pos++;
  return {
    ok: true,
    value: {
      type: "let",
      mutable,
      name,
      value: value.value,
      span: spanOf(state, start),
    },
  };
}

function parseStatement(state: ParserState): Result<Node, EvalError> {
  if (state.tokens[state.pos]?.text === "let") return parseLetBinding(state);
  const name = state.tokens[state.pos]?.text;
  if (name !== undefined && state.tokens[state.pos + 1]?.text === "=") {
    const start = state.pos;
    state.pos += 2;
    const value = parseExpr(state);
    if (!value.ok) return value;
    if (state.tokens[state.pos]?.text !== ";") return state.fail("expected ;");
    state.pos++;
    return {
      ok: true,
      value: {
        type: "assign",
        name,
        value: value.value,
        span: spanOf(state, start),
      },
    };
  }
  return parseOr(state);
}

function parseStatements(state: ParserState): Result<Node[], EvalError> {
  const statements: Node[] = [];
  while (
    state.tokens[state.pos] !== undefined &&
    state.tokens[state.pos]?.text !== "}"
  ) {
    const s = parseStatement(state);
    if (!s.ok) return s;
    statements.push(s.value);
  }
  return { ok: true, value: statements };
}

function parseTerm(state: ParserState): Result<Node, EvalError> {
  const lhs = parseUnary(state);
  if (!lhs.ok) return lhs;
  if (
    state.tokens[state.pos]?.text !== "*" &&
    state.tokens[state.pos]?.text !== "/"
  )
    return lhs;
  let node: Node = lhs.value;
  while (true) {
    const op = state.tokens[state.pos]?.text;
    if (op !== "*" && op !== "/") break;
    state.pos++;
    const rhs = parseUnary(state);
    if (!rhs.ok) return rhs;
    node = {
      type: "binary",
      op,
      lhs: node,
      rhs: rhs.value,
      span: spanFrom(node.span.start, rhs.value.span.end),
    };
  }
  return { ok: true, value: node };
}

function parseUnary(state: ParserState): Result<Node, EvalError> {
  const t = state.tokens[state.pos]?.text;
  if (t === "-" || t === "!") {
    const start = state.tokens[state.pos]?.start ?? 0;
    state.pos++;
    const operand = parseUnary(state);
    if (!operand.ok) return operand;
    return {
      ok: true,
      value: {
        type: "unary",
        op: t,
        operand: operand.value,
        span: spanFrom(start, operand.value.span.end),
      },
    };
  }
  return parseFactor(state);
}

function parseFactor(state: ParserState): Result<Node, EvalError> {
  const t = state.tokens[state.pos]?.text;
  if (t === "(") {
    state.pos++;
    const node = parseExpr(state);
    if (!node.ok) return node;
    if (state.tokens[state.pos]?.text !== ")") return state.fail("expected )");
    state.pos++;
    return node;
  }
  if (t === "{") {
    const start = state.pos;
    state.pos++;
    const statements = parseStatements(state);
    if (!statements.ok) return statements;
    if (state.tokens[state.pos]?.text !== "}") return state.fail("expected }");
    state.pos++;
    return {
      ok: true,
      value: {
        type: "block",
        statements: statements.value,
        span: spanOf(state, start),
      },
    };
  }
  if (t === undefined) return state.fail("unexpected end of input");
  if (t === "if") {
    const start = state.pos;
    state.pos++;
    if (state.tokens[state.pos]?.text !== "(") return state.fail("expected (");
    state.pos++;
    const cond = parseExpr(state);
    if (!cond.ok) return cond;
    if (state.tokens[state.pos]?.text !== ")") return state.fail("expected )");
    state.pos++;
    const then = parseExpr(state);
    if (!then.ok) return then;
    if (state.tokens[state.pos]?.text !== "else")
      return state.fail("expected else");
    state.pos++;
    const els = parseExpr(state);
    if (!els.ok) return els;
    return {
      ok: true,
      value: {
        type: "if",
        cond: cond.value,
        then: then.value,
        else: els.value,
        span: spanOf(state, start),
      },
    };
  }
  if (t === "true") {
    const span = currentSpan(state);
    state.pos++;
    return { ok: true, value: { type: "bool", value: true, span } };
  }
  if (t === "false") {
    const span = currentSpan(state);
    state.pos++;
    return { ok: true, value: { type: "bool", value: false, span } };
  }
  if (/^[A-Za-z_]/.test(t)) {
    const span = currentSpan(state);
    state.pos++;
    return { ok: true, value: { type: "var", name: t, span } };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return state.fail(`not a number: ${t}`);
  const span = currentSpan(state);
  state.pos++;
  return { ok: true, value: { type: "number", value: n, span } };
}

export function parse(input: string): Result<Node[], EvalError> {
  const tokenized = tokenize(input);
  if (!tokenized.ok)
    return {
      ok: false,
      error: invalidInput(input, tokenized.error.reason, {
        start: tokenized.error.offset,
        end: tokenized.error.offset + 1,
      }),
    };
  const state: ParserState = {
    tokens: tokenized.value,
    pos: 0,
    fail: (reason) => ({
      ok: false,
      error: invalidInput(input, reason, currentSpan(state)),
    }),
  };
  const statements = parseStatements(state);
  if (!statements.ok) return statements;
  if (state.pos < state.tokens.length)
    return state.fail(
      `unexpected token: ${state.tokens[state.pos]?.text ?? ""}`,
    );
  return statements;
}
