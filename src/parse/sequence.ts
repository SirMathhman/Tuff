import {
  letNameAtEnd,
  letNotName,
  missingOperator,
  missingSemicolon,
  undefinedVariable,
  valueInStatementBlock,
} from "../errors.ts";
import { err, ok } from "../result.ts";
import {
  childScope,
  closeScope,
  declare,
  findEscape,
  setCell,
} from "../scope.ts";
import type { Scope } from "../scope.ts";
import { isStarAt, textAt, tokenText } from "../tokenize.ts";
import type { NameToken, Token } from "../tokenize.ts";
import { parseExpression } from "./expression.ts";
import { parseValue } from "./value.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// What a statement leaves behind: the index after it, and the scope after it.
interface Statement {
  next: number;
  scope: Scope;
}

// Parses zero or more statements, then one expression. A statement is
// "let [mut] name = value ;", "name = value ;", "*name = expression ;", or a
// block statement. The value of the sequence is its final expression.
export function parseSequence(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  const statement = parseStatement(tokens, index, scope, end, factor);
  if (statement === undefined) {
    return parseExpression(tokens, index, scope, end, factor);
  }
  if (!statement.ok) {
    return statement;
  }
  return parseSequence(
    tokens,
    statement.value.next,
    statement.value.scope,
    end,
    factor,
  );
}

// Parses one statement at `index`, or returns undefined if no statement starts
// there.
function parseStatement(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Statement> | undefined {
  const token = tokens[index];
  if (token?.kind === "let") {
    return parseLet(tokens, index, scope, end, factor);
  }
  if (token?.kind === "name" && tokens[index + 1]?.kind === "equals") {
    return parseAssign(tokens, index, token, scope, end, factor);
  }
  const nameToken = tokens[index + 1];
  if (
    isStarAt(tokens, index) &&
    nameToken?.kind === "name" &&
    tokens[index + 2]?.kind === "equals"
  ) {
    return parseDerefAssign(tokens, index, nameToken, scope, end, factor);
  }
  if (isStatementBlock(tokens, index)) {
    return parseBlockStatement(tokens, index, scope, end, factor);
  }
  return undefined;
}

// The index of the bracket that closes the one at `index`, or undefined if none
// does.
function matchingClose(tokens: Token[], index: number): number | undefined {
  let depth = 0;
  for (let position = index; position < tokens.length; position++) {
    const token = tokens[position];
    if (token?.kind === "open") {
      depth++;
    } else if (token?.kind === "close") {
      depth--;
      if (depth === 0) {
        return position;
      }
    }
  }
  return undefined;
}

// True when the "{" at `index` opens a block with no final value. Every statement
// ends with ";", and a final expression cannot, so a block ends with ";" exactly
// when it has no final value. Such a block is a statement, not an expression.
function isStatementBlock(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  if (token?.kind !== "open" || token.symbol !== "{") {
    return false;
  }
  const close = matchingClose(tokens, index);
  if (close === undefined) {
    return false;
  }
  const closing = tokens[close];
  return (
    closing?.kind === "close" &&
    closing.symbol === "}" &&
    tokens[close - 1]?.kind === "semicolon"
  );
}

// Parses "{ statements }" as a statement. Its lets stay inside it, and its
// assignments to outer variables persist after it closes.
function parseBlockStatement(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Statement> {
  const body = parseBlockBody(
    tokens,
    index + 1,
    childScope(scope),
    end,
    factor,
  );
  if (!body.ok) {
    return body;
  }
  const close = tokens[body.value.next];
  const escaped = findEscape(scope, body.value.scope);
  if (escaped !== undefined) {
    return err({
      what: "Reference escapes block",
      where: close?.pos ?? end,
      why: `"${escaped}" would refer to a variable that ends with this block`,
      fix: "Point the outer variable at a variable that lives as long as it does",
    });
  }
  return ok({
    next: body.value.next + 1,
    scope: closeScope(scope, body.value.scope),
  });
}

// Parses statements up to the "}" that closes the block. `next` in the result is
// the index of that "}". Anything else inside the block that is not a statement
// is a value, and a block statement cannot have one.
function parseBlockBody(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Statement> {
  const statement = parseStatement(tokens, index, scope, end, factor);
  if (statement === undefined) {
    const token = tokens[index];
    if (token?.kind === "semicolon") {
      return err(missingOperator(token.pos, ";"));
    }
    if (token?.kind !== "close") {
      return err(
        valueInStatementBlock(token?.pos ?? end, textAt(tokens, index)),
      );
    }
    return ok({ next: index, scope });
  }
  if (!statement.ok) {
    return statement;
  }
  return parseBlockBody(
    tokens,
    statement.value.next,
    statement.value.scope,
    end,
    factor,
  );
}

// Parses "let [mut] name = value ;". `index` points at "let".
function parseLet(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Statement> {
  const mutable = tokens[index + 1]?.kind === "mut";
  const nameIndex = mutable ? index + 2 : index + 1;
  const nameToken = tokens[nameIndex];
  if (nameToken === undefined) {
    return err(letNameAtEnd(end));
  }
  if (nameToken.kind !== "name") {
    return err(letNotName(nameToken.pos, tokenText(nameToken)));
  }
  const name = nameToken.name;
  const equalsIndex = nameIndex + 1;
  const equals = tokens[equalsIndex];
  if (equals === undefined) {
    return err({
      what: "Missing =",
      where: end,
      why: `Expected "=" after "${name}"`,
      fix: `Add "=" and a value after "${name}"`,
    });
  }
  if (equals.kind !== "equals") {
    return err({
      what: "Missing =",
      where: equals.pos,
      why: `Found "${tokenText(equals)}" where "=" is required`,
      fix: `Put "=" after "${name}"`,
    });
  }
  const value = parseValue(tokens, equalsIndex + 1, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return err(
      missingSemicolon(
        semicolon?.pos ?? end,
        `The let statement for "${name}"`,
      ),
    );
  }
  const current = value.value.scope;
  if (current.own.has(name)) {
    return err({
      what: "Duplicate variable",
      where: nameToken.pos,
      why: `"${name}" is already declared in this block`,
      fix: "Rename this variable, or delete this declaration",
    });
  }
  return ok({
    next: semicolonIndex + 1,
    scope: declare(current, name, mutable, value.value.value),
  });
}

// Parses "name = value ;". Only a `let mut` variable may be assigned. `index`
// points at the name.
function parseAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Statement> {
  const name = nameToken.name;
  const variable = scope.names.get(name);
  if (variable === undefined) {
    return err({
      what: "Undefined variable",
      where: nameToken.pos,
      why: `"${name}" has not been declared`,
      fix: `Declare it first with let mut ${name} = ...;, or fix the spelling`,
    });
  }
  if (!variable.mutable) {
    return err({
      what: "Immutable variable",
      where: nameToken.pos,
      why: `"${name}" was declared with let, so it cannot be reassigned`,
      fix: `Declare it with let mut ${name} = ...; to allow reassignment`,
    });
  }
  const value = parseValue(tokens, index + 2, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return err(
      missingSemicolon(semicolon?.pos ?? end, `The assignment to "${name}"`),
    );
  }
  return ok({
    next: semicolonIndex + 1,
    scope: setCell(value.value.scope, variable.id, value.value.value),
  });
}

// Parses "*name = expression ;". The reference must be a `&mut`. `index` points
// at the "*"; `nameToken` is the name after it.
function parseDerefAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Statement> {
  const name = nameToken.name;
  const variable = scope.names.get(name);
  if (variable === undefined) {
    return err(undefinedVariable(name, nameToken.pos));
  }
  const cell = scope.cells.get(variable.id);
  if (cell === undefined || typeof cell !== "object") {
    return err({
      what: "Not a reference",
      where: nameToken.pos,
      why: `"${name}" does not hold a reference`,
      fix: "Only a variable that holds &mut x can be written through with *name = ...;",
    });
  }
  if (!cell.mutable) {
    return err({
      what: "Read-only reference",
      where: nameToken.pos,
      why: `"${name}" holds a read-only reference, so it cannot be written through`,
      fix: `Borrow the variable with &mut to allow writing through *${name}`,
    });
  }
  const value = parseExpression(tokens, index + 3, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return err(
      missingSemicolon(
        semicolon?.pos ?? end,
        `The assignment through "*${name}"`,
      ),
    );
  }
  return ok({
    next: semicolonIndex + 1,
    scope: setCell(value.value.scope, cell.target, value.value.value),
  });
}
