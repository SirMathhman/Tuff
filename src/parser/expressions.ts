import type { MatchArm, MatchPattern, Value, ValueIf, ValueMatch } from "../core/ast.js";
import { ok, type EvalError, type Result } from "../core/errors.js";
import { advance, peek, unexpected, type Cursor } from "./cursor.js";

/**
 * A block-value parser, threaded through the expression parser as an explicit
 * dependency. Expressions and statements mutually recurse through block values
 * (`{ ... }` as a value), so the statement parser passes its block-value parser
 * in here rather than importing it (which would be a module cycle).
 */
export type BlockValueParser = (cursor: Cursor) => Result<Value, EvalError>;

/** Parse an array literal `[e1, e2, ...]`. */
function parseArrayLiteral(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<Value, EvalError> {
  advance(cursor); // consume `[`
  const elements: Value[] = [];
  if (peek(cursor)?.kind === "rbracket") {
    advance(cursor);
    return ok({ kind: "array", elements, position });
  }
  for (;;) {
    const element = parseValue(cursor, block);
    if (!element.ok) {
      return element;
    }
    elements.push(element.value);
    const next = peek(cursor);
    if (next?.kind === "comma") {
      advance(cursor);
      continue;
    }
    if (next?.kind === "rbracket") {
      advance(cursor);
      return ok({ kind: "array", elements, position });
    }
    return unexpected(cursor);
  }
}

/** Parse a primary value: a number, bool, identifier, array, or block. */
function parsePrimary(cursor: Cursor, block: BlockValueParser): Result<Value, EvalError> {
  const token = peek(cursor);
  if (!token) {
    return unexpected(cursor);
  }
  if (token.kind === "number") {
    advance(cursor);
    return ok({
      kind: "number",
      value: token.value,
      suffix: token.suffix,
      position: token.position,
    });
  }
  if (token.kind === "bool") {
    advance(cursor);
    return ok({ kind: "bool", value: token.value, position: token.position });
  }
  if (token.kind === "ident") {
    advance(cursor);
    return ok({ kind: "ident", name: token.value, position: token.position });
  }
  if (token.kind === "lbracket") {
    return parseArrayLiteral(cursor, token.position, block);
  }
  if (token.kind === "lbrace") {
    return block(cursor);
  }
  if (token.kind === "if") {
    return parseIf(cursor, token.position, block);
  }
  if (token.kind === "match") {
    return parseMatch(cursor, token.position, block);
  }
  if (token.kind === "addressOf" || token.kind === "deref") {
    const operator = token.kind;
    advance(cursor);
    const target = parsePrimary(cursor, block);
    if (!target.ok) {
      return target;
    }
    if (operator === "addressOf") {
      return ok({
        kind: "addressOf",
        mutable: token.mutable,
        target: target.value,
        position: token.position,
      });
    }
    return ok({ kind: "deref", target: target.value, position: token.position });
  }
  return unexpected(cursor);
}

/**
 * Parse zero or more index suffixes (`[i]`) applied to `value`, producing
 * nodes of the given kind (`"index"` for reads, `"indexAssign"` for lvalues).
 */
export function parseIndexSuffixes(
  cursor: Cursor,
  value: Value,
  kind: "index" | "indexAssign",
  block: BlockValueParser,
): Result<Value, EvalError> {
  while (peek(cursor)?.kind === "lbracket") {
    const bracket = peek(cursor)!;
    advance(cursor);
    const index = parseValue(cursor, block);
    if (!index.ok) {
      return index;
    }
    if (peek(cursor)?.kind !== "rbracket") {
      return unexpected(cursor);
    }
    advance(cursor);
    value = { kind, target: value, index: index.value, position: bracket.position };
  }
  return ok(value);
}

/**
 * Parse a postfix expression: a primary followed by zero or more index
 * operations (`[i]`), which bind tighter than any binary operator.
 */
function parsePostfix(cursor: Cursor, block: BlockValueParser): Result<Value, EvalError> {
  const value = parsePrimary(cursor, block);
  if (!value.ok) {
    return value;
  }
  return parseIndexSuffixes(cursor, value.value, "index", block);
}

/**
 * Parse an additive expression: a postfix followed by zero or more `+`
 * operations, chained left-associatively.
 */
function parseAdditive(cursor: Cursor, block: BlockValueParser): Result<Value, EvalError> {
  let value = parsePostfix(cursor, block);
  if (!value.ok) {
    return value;
  }
  while (true) {
    const operatorToken = peek(cursor);
    if (operatorToken?.kind !== "binary" || operatorToken.operator !== "+") {
      break;
    }
    advance(cursor);
    const right = parsePostfix(cursor, block);
    if (!right.ok) {
      return right;
    }
    value = ok({
      kind: "binary",
      operator: "+",
      left: value.value,
      right: right.value,
      position: value.value.position,
    });
  }
  return value;
}

/**
 * Parse an `is` type-test: an additive expression optionally followed by
 * `is <TypeName>`. `is` binds tighter than comparisons but looser than
 * additive, so `100U8 is U8 == 1` parses as `(100U8 is U8) == 1`.
 */
function parseIs(cursor: Cursor, block: BlockValueParser): Result<Value, EvalError> {
  const operand = parseAdditive(cursor, block);
  if (!operand.ok) {
    return operand;
  }
  if (peek(cursor)?.kind !== "is") {
    return operand;
  }
  advance(cursor); // consume `is`
  const name = peek(cursor);
  if (name?.kind !== "ident") {
    return unexpected(cursor);
  }
  advance(cursor);
  return ok({
    kind: "is",
    operand: operand.value,
    type: name.value,
    position: name.position,
  });
}

/**
 * Parse a `( condition )` group shared by `if` and `while`: an lparen, a value
 * expression, and a matching rparen.
 */
export function parseCondition(cursor: Cursor, block: BlockValueParser): Result<Value, EvalError> {
  if (peek(cursor)?.kind !== "lparen") {
    return unexpected(cursor);
  }
  advance(cursor);
  const condition = parseValue(cursor, block);
  if (!condition.ok) {
    return condition;
  }
  if (peek(cursor)?.kind !== "rparen") {
    return unexpected(cursor);
  }
  advance(cursor);
  return condition;
}

/**
 * Parse an `if` expression: `if (condition) then else else`. The branches are
 * value expressions (not blocks); the else-branch may itself be an `if`
 * expression, so `else if` chains naturally.
 */
function parseIf(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<ValueIf, EvalError> {
  advance(cursor); // consume `if`
  const condition = parseCondition(cursor, block);
  if (!condition.ok) {
    return condition;
  }
  const then = parseValue(cursor, block);
  if (!then.ok) {
    return then;
  }
  if (peek(cursor)?.kind !== "else") {
    return unexpected(cursor);
  }
  advance(cursor);
  const elseBranch = parseValue(cursor, block);
  if (!elseBranch.ok) {
    return elseBranch;
  }
  return ok({
    kind: "if",
    condition: condition.value,
    then: then.value,
    else: elseBranch.value,
    position,
  });
}

/** Parse a `case` pattern: a number/bool literal or the `_` wildcard. */
function parseMatchPattern(cursor: Cursor): Result<MatchPattern, EvalError> {
  const head = peek(cursor);
  if (!head) {
    return unexpected(cursor);
  }
  if (head.kind === "wildcard") {
    advance(cursor);
    return ok({ kind: "wildcard", position: head.position });
  }
  if (head.kind === "number") {
    advance(cursor);
    return ok({ kind: "number", value: head.value, suffix: head.suffix, position: head.position });
  }
  if (head.kind === "bool") {
    advance(cursor);
    return ok({ kind: "bool", value: head.value, position: head.position });
  }
  return unexpected(cursor);
}

/** Parse one `match` arm: `case pattern => value;`. */
function parseMatchArm(cursor: Cursor, block: BlockValueParser): Result<MatchArm, EvalError> {
  const armStart = peek(cursor)!.position;
  advance(cursor); // consume `case`
  const pattern = parseMatchPattern(cursor);
  if (!pattern.ok) {
    return pattern;
  }
  if (peek(cursor)?.kind !== "arrow") {
    return unexpected(cursor);
  }
  advance(cursor);
  const value = parseValue(cursor, block);
  if (!value.ok) {
    return value;
  }
  consumeSemicolon(cursor);
  return ok({ pattern: pattern.value, value: value.value, position: armStart });
}

/**
 * Parse a `match` expression: `match (scrutinee) { case p1 => v1; ... }`.
 * Patterns are number/bool literals or the `_` wildcard; a `_` arm is
 * required so the expression is total.
 */
function parseMatch(
  cursor: Cursor,
  position: number,
  block: BlockValueParser,
): Result<ValueMatch, EvalError> {
  advance(cursor); // consume `match`
  const scrutinee = parseCondition(cursor, block);
  if (!scrutinee.ok) {
    return scrutinee;
  }
  if (peek(cursor)?.kind !== "lbrace") {
    return unexpected(cursor);
  }
  advance(cursor);
  const arms: MatchArm[] = [];
  while (peek(cursor)?.kind === "case") {
    const arm = parseMatchArm(cursor, block);
    if (!arm.ok) {
      return arm;
    }
    arms.push(arm.value);
  }
  if (arms.length === 0) {
    return unexpected(cursor);
  }
  if (peek(cursor)?.kind !== "rbrace") {
    return unexpected(cursor);
  }
  advance(cursor);
  return ok({ kind: "match", scrutinee: scrutinee.value, arms, position });
}

/**
 * Parse a value expression: an `is`-type-test expression followed by zero or
 * more comparison operations (`==`, `!=`, `<`, `<=`, `>`, `>=`), chained
 * left-associatively.
 */
export function parseValue(cursor: Cursor, block: BlockValueParser): Result<Value, EvalError> {
  let value = parseIs(cursor, block);
  if (!value.ok) {
    return value;
  }
  while (true) {
    const operatorToken = peek(cursor);
    if (operatorToken?.kind !== "binary" || operatorToken.operator === "+") {
      break;
    }
    advance(cursor);
    const right = parseIs(cursor, block);
    if (!right.ok) {
      return right;
    }
    value = ok({
      kind: "binary",
      operator: operatorToken.operator,
      left: value.value,
      right: right.value,
      position: value.value.position,
    });
  }
  if (peek(cursor)?.kind === "range") {
    const rangeToken = peek(cursor)!;
    advance(cursor);
    const end = parseValue(cursor, block);
    if (!end.ok) {
      return end;
    }
    return ok({
      kind: "range",
      start: value.value,
      end: end.value,
      position: rangeToken.position,
    });
  }
  return value;
}

/** Consume an optional trailing semicolon after a statement. */
export function consumeSemicolon(cursor: Cursor): void {
  if (peek(cursor)?.kind === "semicolon") {
    advance(cursor);
  }
}

/** Parse a value expression followed by an optional trailing semicolon. */
export function parseValueAndSemicolon(
  cursor: Cursor,
  block: BlockValueParser,
): Result<Value, EvalError> {
  const value = parseValue(cursor, block);
  if (!value.ok) {
    return value;
  }
  consumeSemicolon(cursor);
  return value;
}
