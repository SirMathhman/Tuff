import {
  letNameAtEnd,
  letNotName,
  missingSemicolon,
  undefinedVariable,
} from "../errors.ts";
import { err } from "../result.ts";
import { declare, setCell } from "../scope.ts";
import type { Scope } from "../scope.ts";
import { isStarAt, tokenText } from "../tokenize.ts";
import type { NameToken, Token } from "../tokenize.ts";
import { parseExpression } from "./expression.ts";
import { parseValue } from "./value.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// Parses zero or more statements, then one expression. A statement is
// "let [mut] name = value ;", "name = value ;", or "*name = expression ;".
// The value of the sequence is its final expression.
export function parseSequence(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
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
  return parseExpression(tokens, index, scope, end, factor);
}

// Parses "let [mut] name = value ;" and then the rest of the sequence. `index`
// points at "let".
function parseLet(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
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
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    declare(current, name, mutable, value.value.value),
    end,
    factor,
  );
}

// Parses "name = value ;" and then the rest of the sequence. Only a `let mut`
// variable may be assigned. `index` points at the name.
function parseAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
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
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    setCell(value.value.scope, variable.id, value.value.value),
    end,
    factor,
  );
}

// Parses "*name = expression ;" and then the rest of the sequence. The reference
// must be a `&mut`. `index` points at the "*"; `nameToken` is the name after it.
function parseDerefAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
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
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    setCell(value.value.scope, cell.target, value.value.value),
    end,
    factor,
  );
}
