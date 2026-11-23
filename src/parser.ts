import { ok, type Result } from "./errors.ts";
import { type CompareOp, type Expr, type Link } from "./ast.ts";
import { isDigits, isIdentifier } from "./tokenizer.ts";
import { whereAt, invalidAt, termTooLargeAt, nestingTooDeepAt, MAX_NESTING_DEPTH, type Parse, type ExprRule } from "./parse-errors.ts";
import { parseCondition } from "./conditions.ts";
import { blockBody } from "./statements.ts";

// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | "true" | "false" | name | "(" expr ")" | "{" body "}"
//              | "if" "(" expr ")" expr "else" expr
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

function operatorAt(
  token: string | undefined,
  allowed: Link["op"][],
): Link["op"] | undefined {
  return allowed.find((candidate) => candidate === token);
}

function parseChain(
  tokens: string[],
  pos: number,
  allowed: Link["op"][],
  operand: (next: number) => Parse,
): Parse {
  const first = operand(pos);

  if (!first.ok) {
    return first;
  }

  const links: Link[] = [];
  let next = first.value.next;
  let op = operatorAt(tokens[next], allowed);

  while (op !== undefined) {
    const right = operand(next + 1);

    if (!right.ok) {
      return right;
    }

    links.push({ op, operand: right.value.value, where: whereAt(tokens, next) });
    next = right.value.next;
    op = operatorAt(tokens[next], allowed);
  }

  return ok({
    value: links.length === 0 ? first.value.value : { kind: "chain", first: first.value.value, links },
    next,
  });
}

function parsePrimary(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  const token = tokens[pos];

  if (token === "(" || token === "{") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const closer = token === "(" ? ")" : "}";
    const inner =
      token === "{"
        ? blockBody(tokens, pos + 1, depth + 1, expr)
        : expr(tokens, pos + 1, depth + 1);

    if (!inner.ok) {
      return inner;
    }

    if (tokens[inner.value.next] !== closer) {
      return invalidAt(
        tokens,
        inner.value.next,
        `'${closer}'`,
        `Close the group with '${closer}'.`,
      );
    }

    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }

  if (token === "true" || token === "false") {
    return ok({ value: { kind: "boolean", value: token === "true" }, next: pos + 1 });
  }

  if (token === "if") {
    return parseIf(tokens, pos, depth, expr);
  }

  if (token !== undefined && isDigits(token)) {
    if (Number(token) > Number.MAX_SAFE_INTEGER) {
      return termTooLargeAt(tokens, pos);
    }

    return ok({ value: { kind: "number", value: Number(token) }, next: pos + 1 });
  }

  if (token !== undefined && isIdentifier(token)) {
    return ok({ value: { kind: "reference", name: token, where: whereAt(tokens, pos) }, next: pos + 1 });
  }

  return invalidAt(
    tokens,
    pos,
    "a number, a name, '-', or '('",
    "Put a number, a name, a '-' before a number, or a parenthesized expression here.",
  );
}

function parseIf(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const condition = parseCondition(tokens, pos, depth, expr);

  if (!condition.ok) {
    return condition;
  }

  const then = expr(tokens, condition.value.next, depth + 1);

  if (!then.ok) {
    return then;
  }

  if (tokens[then.value.next] !== "else") {
    return invalidAt(tokens, then.value.next, "'else' after the then branch", "Every if needs an else branch.");
  }

  const otherwise = expr(tokens, then.value.next + 1, depth + 1);

  if (!otherwise.ok) {
    return otherwise;
  }

  return ok({
    value: {
      kind: "if",
      condition: condition.value.value,
      then: then.value.value,
      otherwise: otherwise.value.value,
      where: whereAt(tokens, pos),
    },
    next: otherwise.value.next,
  });
}

function parseFactor(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  if (tokens[pos] === "-") {
    const operand = parsePrimary(tokens, pos + 1, depth, expr);

    return operand.ok
      ? ok({ value: { kind: "negate", operand: operand.value.value, where: whereAt(tokens, pos) }, next: operand.value.next })
      : operand;
  }

  return parsePrimary(tokens, pos, depth, expr);
}

function parseTerm(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  return parseChain(tokens, pos, ["*"], (next) =>
    parseFactor(tokens, next, depth, expr),
  );
}

function parseSum(tokens: string[], pos: number, depth: number): Parse {
  return parseChain(tokens, pos, ["+", "-"], (next) =>
    parseTerm(tokens, next, depth, parseExpr),
  );
}

const COMPARISONS: CompareOp[] = ["<", "<=", ">", ">=", "==", "!="];

function comparisonAt(token: string | undefined): CompareOp | undefined {
  return COMPARISONS.find((candidate) => candidate === token);
}

/**
 * Parses a comparison: a sum, optionally followed by one comparison operator and a sum.
 * @param tokens - The token list to parse.
 * @param pos - The index of the first token of the expression.
 * @param depth - The number of groups enclosing this position.
 * @returns The expression tree and the index of the next unread token, or an error.
 */
export function parseExpr(tokens: string[], pos: number, depth: number): Parse {
  const left = parseSum(tokens, pos, depth);

  if (!left.ok) {
    return left;
  }

  const op = comparisonAt(tokens[left.value.next]);

  if (op === undefined) {
    return left;
  }

  const right = parseSum(tokens, left.value.next + 1, depth);

  if (!right.ok) {
    return right;
  }

  return ok({
    value: {
      kind: "compare",
      op,
      left: left.value.value,
      right: right.value.value,
      where: whereAt(tokens, left.value.next),
    },
    next: right.value.next,
  });
}

// A "{" starts a statement block when its contents begin with a statement and
// the token after its closing "}" can start a statement, an expression, or end
// an enclosing block. A block followed by an operator is a value, as in
// "{ let x = 2; x } * 4".
// An "if" is a statement when both branches are statement blocks (each ends
// with ";") and the token after the else block cannot continue an expression.
// A following operator makes the whole if an expression, as with statement blocks.
