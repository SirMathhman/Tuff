import { textAt, type Token } from "./tokenizer.ts";
import {
  emptyArrayAt,
  integerOutOfRangeAt,
  ok,
  type Result,
  type TuffError,
} from "./errors.ts";
import {
  INT_RANGES,
  type CompareOp,
  type Expr,
  type Link,
  type LogicalOp,
  type RecordField,
} from "./ast.ts";
import { intLiteralType, isDigits, isIdentifier } from "./tokenizer.ts";
import {
  whereAt,
  invalidAt,
  termTooLargeAt,
  nestingTooDeepAt,
  MAX_NESTING_DEPTH,
  type Parse,
  type ParseRules,
} from "./parse-errors.ts";
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
//   term      := factor (("*" | "/") factor)*
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

    links.push({
      op,
      operand: right.value.value,
      where: whereAt(tokens, next),
    });
    next = right.value.next;
    op = operatorAt(textAt(tokens, next), allowed);
  }

  return ok({
    value:
      links.length === 0
        ? first.value.value
        : { kind: "chain", first: first.value.value, links },
    next,
  });
}

function parsePrimary(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  if (isRecordLiteral(tokens, pos)) {
    const record = parseFields(tokens, pos, depth, rules);

    return record.ok
      ? ok({
          value: {
            kind: "record",
            fields: record.value.fields,
            where: whereAt(tokens, pos),
          },
          next: record.value.next,
        })
      : record;
  }

  if (isIdentifier(textAt(tokens, pos)) && isRecordLiteral(tokens, pos + 1)) {
    const record = parseFields(tokens, pos + 1, depth, rules);

    return record.ok
      ? ok({
          value: {
            kind: "construct",
            name: textAt(tokens, pos),
            fields: record.value.fields,
            where: whereAt(tokens, pos),
          },
          next: record.value.next,
        })
      : record;
  }

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

  if (token === "[") {
    return parseArray(tokens, pos, depth, rules);
  }

  if (token === "true" || token === "false") {
    return ok({
      value: { kind: "boolean", value: token === "true" },
      next: pos + 1,
    });
  }

  if (token === "if") {
    return parseIf(tokens, pos, depth, rules);
  }

  const current = tokens[pos];

  if (current?.kind === "unclosedString") {
    return invalidAt(
      tokens,
      pos,
      "a closing ' after the string",
      "Close the string with a single quote.",
    );
  }

  if (current?.kind === "string") {
    return parseString(tokens, pos);
  }

  if (token !== undefined && isDigits(token)) {
    if (Number(token) > Number.MAX_SAFE_INTEGER) {
      return termTooLargeAt(tokens, pos);
    }

    return ok({
      value: { kind: "number", value: Number(token) },
      next: pos + 1,
    });
  }

  const sized = literalAt(tokens, pos, false);

  if (sized !== undefined) {
    return sized;
  }

  if (
    token !== undefined &&
    isIdentifier(token) &&
    textAt(tokens, pos + 1) === "("
  ) {
    return parseCall(tokens, pos, depth, rules);
  }

  if (token !== undefined && isIdentifier(token)) {
    return ok({
      value: { kind: "reference", name: token, where: whereAt(tokens, pos) },
      next: pos + 1,
    });
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
    return invalidAt(
      tokens,
      pos,
      "a valid escape: \\\\, \\', \\n, or \\t",
      "Use only \\\\, \\', \\n, or \\t inside a string.",
    );
  }

  if ([...text].length !== 1) {
    return invalidAt(
      tokens,
      pos,
      "a string of exactly one character",
      "Put exactly one character between the quotes.",
    );
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
    return invalidAt(
      tokens,
      then.value.next,
      "'else' after the then branch",
      "Every if needs an else branch.",
    );
  }

  const otherwise = rules.comparison(
    tokens,
    then.value.next + 1,
    depth + 1,
    rules,
  );

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

function parseArray(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  if (textAt(tokens, pos + 1) === "]") {
    return emptyArrayAt(whereAt(tokens, pos));
  }

  const elements: Expr[] = [];
  let next = pos + 1;
  let more = true;

  while (more) {
    const element = rules.expr(tokens, next, depth + 1);

    if (!element.ok) {
      return element;
    }

    elements.push(element.value.value);
    next = element.value.next;
    more = textAt(tokens, next) === ",";
    next = more ? next + 1 : next;
  }

  if (textAt(tokens, next) !== "]") {
    return invalidAt(
      tokens,
      next,
      "']' to close the array",
      "Close the array with ']'.",
    );
  }

  return ok({
    value: { kind: "array", elements, where: whereAt(tokens, pos) },
    next: next + 1,
  });
}

// A call such as add(3I32, 4I32): a name, then comma-separated argument expressions in parentheses.
function parseCall(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const args: Expr[] = [];
  let next = pos + 2;

  if (textAt(tokens, next) !== ")") {
    let more = true;

    while (more) {
      const arg = rules.expr(tokens, next, depth + 1);

      if (!arg.ok) {
        return arg;
      }

      args.push(arg.value.value);
      next = arg.value.next;
      more = textAt(tokens, next) === ",";
      next = more ? next + 1 : next;
    }
  }

  if (textAt(tokens, next) !== ")") {
    return invalidAt(
      tokens,
      next,
      "')' to close the call",
      "Close the argument list with ')'.",
    );
  }

  return ok({
    value: {
      kind: "call",
      name: textAt(tokens, pos),
      args,
      where: whereAt(tokens, pos),
    },
    next: next + 1,
  });
}

// A primary followed by any number of index suffixes, as in grid[0][1].
function parseIndexed(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  const base = parsePrimary(tokens, pos, depth, rules);

  if (!base.ok) {
    return base;
  }

  let target: Expr = base.value.value;
  let next = base.value.next;

  while (textAt(tokens, next) === "[" || textAt(tokens, next) === ".") {
    if (textAt(tokens, next) === ".") {
      const field = textAt(tokens, next + 1);

      if (!isIdentifier(field)) {
        return invalidAt(
          tokens,
          next + 1,
          "a field name after '.'",
          "Write the name of a field after the '.'.",
        );
      }

      target = {
        kind: "field",
        target,
        name: field,
        where: whereAt(tokens, next),
      };
      next += 2;
    } else {
      const index = rules.expr(tokens, next + 1, depth + 1);

      if (!index.ok) {
        return index;
      }

      if (textAt(tokens, index.value.next) !== "]") {
        return invalidAt(
          tokens,
          index.value.next,
          "']' after the index",
          "Close the index with ']'.",
        );
      }

      target = {
        kind: "index",
        target,
        index: index.value.value,
        where: whereAt(tokens, next),
      };
      next = index.value.next + 1;
    }
  }

  return ok({ value: target, next });
}

// A record literal starts with "{", a field name, and ":", which no block can begin with.
function isRecordLiteral(tokens: Token[], pos: number): boolean {
  return (
    textAt(tokens, pos) === "{" &&
    isIdentifier(textAt(tokens, pos + 1)) &&
    textAt(tokens, pos + 2) === ":"
  );
}

// { name : value, name : value }: each field name is used once. Returns the fields and the index after "}".
interface FieldsParsed {
  fields: RecordField[];
  next: number;
}

function parseFields(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Result<FieldsParsed, TuffError> {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const fields: RecordField[] = [];
  let next = pos + 1;

  while (true) {
    const name = textAt(tokens, next);

    if (!isIdentifier(name)) {
      return invalidAt(
        tokens,
        next,
        "a field name",
        "Write a field as name : value.",
      );
    }

    if (textAt(tokens, next + 1) !== ":") {
      return invalidAt(
        tokens,
        next + 1,
        "':' after the field name",
        "Write each field as name : value.",
      );
    }

    if (fields.some((field) => field.name === name)) {
      return invalidAt(
        tokens,
        next,
        "a field name not used before in this record",
        "Give each field a different name.",
      );
    }

    const value = rules.expr(tokens, next + 2, depth + 1);

    if (!value.ok) {
      return value;
    }

    fields.push({ name, value: value.value.value });
    next = value.value.next;

    if (textAt(tokens, next) === "}") {
      return ok({ fields, next: next + 1 });
    }

    if (textAt(tokens, next) !== ",") {
      return invalidAt(
        tokens,
        next,
        "',' or '}' after the field",
        "Separate fields with ',' and close the record with '}'.",
      );
    }

    next += 1;
  }
}

// A borrow of a declared name: &name, or &mut name for a writable reference.
function parseRef(tokens: Token[], pos: number): Parse {
  const mutable = textAt(tokens, pos + 1) === "mut";
  const nameIndex = mutable ? pos + 2 : pos + 1;
  const name = textAt(tokens, nameIndex);

  if (!isIdentifier(name)) {
    return invalidAt(
      tokens,
      nameIndex,
      "a name after '&'",
      "Write the name of the value to borrow after '&'.",
    );
  }

  return ok({
    value: { kind: "ref", name, mutable, where: whereAt(tokens, pos) },
    next: nameIndex + 1,
  });
}

// A sized literal such as 100U8 at pos. A minus sign folds into a signed literal, so -128I8 is in range,
// but a minus before an unsigned literal stays a unary operator, which rejects unsigned values.
function literalAt(
  tokens: Token[],
  pos: number,
  negative: boolean,
): Parse | undefined {
  const token = textAt(tokens, pos);
  const type = intLiteralType(token);

  if (type === undefined) {
    return undefined;
  }

  const range = INT_RANGES[type];

  if (negative && range.min === 0n) {
    return undefined;
  }

  const magnitude = BigInt(token.slice(0, -type.length));
  const value = negative ? -magnitude : magnitude;

  if (value < range.min || value > range.max) {
    return integerOutOfRangeAt(
      whereAt(tokens, pos),
      value,
      type,
      range.min,
      range.max,
    );
  }

  return ok({ value: { kind: "int", type, value }, next: pos + 1 });
}

function parseFactor(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  if (textAt(tokens, pos) === "-") {
    const signed = literalAt(tokens, pos + 1, true);

    if (signed !== undefined) {
      return signed;
    }

    const operand = parseIndexed(tokens, pos + 1, depth, rules);

    return operand.ok
      ? ok({
          value: {
            kind: "negate",
            operand: operand.value.value,
            where: whereAt(tokens, pos),
          },
          next: operand.value.next,
        })
      : operand;
  }

  if (textAt(tokens, pos) === "!") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const operand = parseFactor(tokens, pos + 1, depth + 1, rules);

    return operand.ok
      ? ok({
          value: {
            kind: "not",
            operand: operand.value.value,
            where: whereAt(tokens, pos),
          },
          next: operand.value.next,
        })
      : operand;
  }

  if (textAt(tokens, pos) === "&") {
    return parseRef(tokens, pos);
  }

  if (textAt(tokens, pos) === "*") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const operand = parseFactor(tokens, pos + 1, depth + 1, rules);

    return operand.ok
      ? ok({
          value: {
            kind: "deref",
            operand: operand.value.value,
            where: whereAt(tokens, pos),
          },
          next: operand.value.next,
        })
      : operand;
  }

  return parseIndexed(tokens, pos, depth, rules);
}

function parseTerm(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  return parseChain(tokens, pos, ["*", "/"], (next) =>
    parseFactor(tokens, next, depth, rules),
  );
}

function parseShift(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  return parseChain(tokens, pos, ["<<", ">>"], (next) =>
    parseSum(tokens, next, depth, rules),
  );
}

function parseSum(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
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
function parseComparison(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  const left = parseShift(tokens, pos, depth, rules);

  if (!left.ok) {
    return left;
  }

  const op = comparisonAt(textAt(tokens, left.value.next));

  if (op === undefined) {
    return left;
  }

  const right = parseShift(tokens, left.value.next + 1, depth, rules);

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

    left = {
      kind: "logical",
      op: operator,
      left,
      right: right.value.value,
      where: whereAt(tokens, next),
    };
    next = right.value.next;
  }

  return ok({ value: left, next });
}

function parseBitAnd(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  return parseChain(tokens, pos, ["&"], (next) =>
    parseComparison(tokens, next, depth, rules),
  );
}

function parseBitOr(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  return parseChain(tokens, pos, ["|"], (next) =>
    parseBitAnd(tokens, next, depth, rules),
  );
}

function parseAnd(
  tokens: Token[],
  pos: number,
  depth: number,
  rules: ParseRules,
): Parse {
  return parseLogical(tokens, pos, "&&", (next) =>
    parseBitOr(tokens, next, depth, rules),
  );
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

  return parseLogical(tokens, pos, "||", (next) =>
    parseAnd(tokens, next, depth, rules),
  );
}
