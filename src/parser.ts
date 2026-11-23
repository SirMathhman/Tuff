import { textAt, type Token } from "./tokenizer.ts";
import { ok, type Result } from "./errors.ts";
import { type CompareOp, type Expr, type Link, type LogicalOp } from "./ast.ts";
import { isDigits, isIdentifier } from "./tokenizer.ts";
import { whereAt, invalidAt, termTooLargeAt, nestingTooDeepAt, MAX_NESTING_DEPTH, type Parse, type ParseRules } from "./parse-errors.ts";
import { parseCondition } from "./conditions.ts";
import { blockBody } from "./statements.ts";

// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := or
//   or        := and ("||" and)*
//   and       := comparison ("&&" comparison)*
//   comparison := sum (cmp sum)?
//   sum       := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-" primary | "!" factor | primary
//   primary   := number | "true" | "false" | name | "(" expr ")" | "{" body "}"
//              | "if" "(" expr ")" expr "else" comparison
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. Rules that would close a cycle receive
// the rules they need as a parameter (ParseRules), so no function calls a rule
// by name in a cycle.

function operatorAt(
  token: string | undefined,
  allowed: Link["op"][],
): Link["op"] | undefined {
  return allowed.find((candidate) => candidate === token);
}

function parseChain(
  tokens: Token[],
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
  let op = operatorAt(textAt(tokens, next), allowed);

  while (op !== undefined) {
    const right = operand(next + 1);

    if (!right.ok) {
      return right;
    }

    links.push({ op, operand: right.value.value, where: whereAt(tokens, next) });
    next = right.value.next;
    op = operatorAt(textAt(tokens, next), allowed);
  }

  return ok({
    value: links.length === 0 ? first.value.value : { kind: "chain", first: first.value.value, links },
    next,
  });
}

function parsePrimary(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  const token = textAt(tokens, pos);

  if (token === "(" || token === "{") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const closer = token === "(" ? ")" : "}";
    const inner =
      token === "{"
        ? blockBody(tokens, pos + 1, depth + 1, rules.expr)
        : rules.expr(tokens, pos + 1, depth + 1);

    if (!inner.ok) {
      return inner;
    }

    if (textAt(tokens, inner.value.next) !== closer) {
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
    return parseIf(tokens, pos, depth, rules);
  }

  const current = tokens[pos];

  if (current?.kind === "unclosedString") {
    return invalidAt(tokens, pos, "a closing ' after the string", "Close the string with a single quote.");
  }

  if (current?.kind === "string") {
    return parseString(tokens, pos);
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

const ESCAPES: [string, string][] = [
  ["\\", "\\"],
  ["'", "'"],
  ["n", "\n"],
  ["t", "\t"],
];

// Decodes backslash escapes in the body of a string; undefined for an unknown escape.
function decodeEscapes(body: string): string | undefined {
  let text = "";
  let index = 0;

  while (index < body.length) {
    if (body.charAt(index) !== "\\") {
      text += body.charAt(index);
      index += 1;
    } else {
      const escaped = ESCAPES.find(([code]) => code === body.charAt(index + 1));

      if (escaped === undefined) {
        return undefined;
      }

      text += escaped[1];
      index += 2;
    }
  }

  return text;
}

function parseString(tokens: Token[], pos: number): Parse {
  const text = decodeEscapes(textAt(tokens, pos).slice(1, -1));

  if (text === undefined) {
    return invalidAt(tokens, pos, "a valid escape: \\\\, \\', \\n, or \\t", "Use only \\\\, \\', \\n, or \\t inside a string.");
  }

  if ([...text].length !== 1) {
    return invalidAt(tokens, pos, "a string of exactly one character", "Put exactly one character between the quotes.");
  }

  return ok({ value: { kind: "string", value: text }, next: pos + 1 });
}

function parseIf(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const condition = parseCondition(tokens, pos, depth, rules.expr);

  if (!condition.ok) {
    return condition;
  }

  const then = rules.expr(tokens, condition.value.next, depth + 1);

  if (!then.ok) {
    return then;
  }

  if (textAt(tokens, then.value.next) !== "else") {
    return invalidAt(tokens, then.value.next, "'else' after the then branch", "Every if needs an else branch.");
  }

  const otherwise = rules.comparison(tokens, then.value.next + 1, depth + 1, rules);

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
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  if (textAt(tokens, pos) === "-") {
    const operand = parsePrimary(tokens, pos + 1, depth, rules);

    return operand.ok
      ? ok({ value: { kind: "negate", operand: operand.value.value, where: whereAt(tokens, pos) }, next: operand.value.next })
      : operand;
  }

  if (textAt(tokens, pos) === "!") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const operand = parseFactor(tokens, pos + 1, depth + 1, rules);

    return operand.ok
      ? ok({ value: { kind: "not", operand: operand.value.value, where: whereAt(tokens, pos) }, next: operand.value.next })
      : operand;
  }

  return parsePrimary(tokens, pos, depth, rules);
}

function parseTerm(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  return parseChain(tokens, pos, ["*"], (next) =>
    parseFactor(tokens, next, depth, rules),
  );
}

function parseSum(tokens: Token[], pos: number, depth: number, rules: ParseRules): Parse {
  return parseChain(tokens, pos, ["+", "-"], (next) =>
    parseTerm(tokens, next, depth, rules),
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
 * @param rules - The rules this parse needs from above.
 * @returns The expression tree and the index of the next unread token, or an error.
 */
function parseComparison(tokens: Token[], pos: number, depth: number, rules: ParseRules): Parse {
  const left = parseSum(tokens, pos, depth, rules);

  if (!left.ok) {
    return left;
  }

  const op = comparisonAt(textAt(tokens, left.value.next));

  if (op === undefined) {
    return left;
  }

  const right = parseSum(tokens, left.value.next + 1, depth, rules);

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

/**
 * Parses a left-associative chain of one logical operator over a lower-precedence operand.
 * @param tokens - The token list to parse.
 * @param pos - The index of the first token of the chain.
 * @param operator - The logical operator that separates the operands.
 * @param operand - The rule for one operand.
 * @returns The expression tree and the index of the next unread token, or an error.
 */
function parseLogical(
  tokens: Token[],
  pos: number,
  operator: LogicalOp,
  operand: (next: number) => Parse,
): Parse {
  const first = operand(pos);

  if (!first.ok) {
    return first;
  }

  let left = first.value.value;
  let next = first.value.next;

  while (textAt(tokens, next) === operator) {
    const right = operand(next + 1);

    if (!right.ok) {
      return right;
    }

    left = { kind: "logical", op: operator, left, right: right.value.value, where: whereAt(tokens, next) };
    next = right.value.next;
  }

  return ok({ value: left, next });
}

function parseAnd(tokens: Token[], pos: number, depth: number, rules: ParseRules): Parse {
  return parseLogical(tokens, pos, "&&", (next) => parseComparison(tokens, next, depth, rules));
}

/**
 * Parses a full expression: disjunctions of conjunctions of comparisons.
 * @param tokens - The token list to parse.
 * @param pos - The index of the first token of the expression.
 * @param depth - The number of groups enclosing this position.
 * @returns The expression tree and the index of the next unread token, or an error.
 */
export function parseExpr(tokens: Token[], pos: number, depth: number): Parse {
  const rules: ParseRules = { expr: parseExpr, comparison: parseComparison };

  return parseLogical(tokens, pos, "||", (next) => parseAnd(tokens, next, depth, rules));
}
