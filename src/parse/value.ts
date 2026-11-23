import { undefinedVariable } from "../errors.ts";
import { err, ok } from "../result.ts";
import type { Scope } from "../scope.ts";
import { tokenText } from "../tokenize.ts";
import type { Token } from "../tokenize.ts";
import { parseExpression } from "./expression.ts";
import type { Evaluated, ParseResult, Parser } from "./types.ts";

// The value of a let or assignment: "&name" or "&mut name" makes a reference;
// anything else is an expression.
export function parseValue(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Evaluated> {
  if (tokens[index]?.kind !== "ampersand") {
    const expression = parseExpression(tokens, index, scope, end, factor);
    if (!expression.ok) {
      return expression;
    }
    return ok({
      value: expression.value.value,
      next: expression.value.next,
      scope: expression.value.scope,
    });
  }
  const mutable = tokens[index + 1]?.kind === "mut";
  const nameIndex = mutable ? index + 2 : index + 1;
  const nameToken = tokens[nameIndex];
  if (nameToken === undefined) {
    return err({
      what: "Missing name",
      where: end,
      why: "& must be followed by a variable name",
      fix: "Add a variable name after &, such as &x",
    });
  }
  if (nameToken.kind !== "name") {
    return err({
      what: "Missing name",
      where: nameToken.pos,
      why: `Found "${tokenText(nameToken)}" where a variable name is required`,
      fix: "Put a variable name after & or &mut, such as &x",
    });
  }
  const variable = scope.names.get(nameToken.name);
  if (variable === undefined) {
    return err(undefinedVariable(nameToken.name, nameToken.pos));
  }
  if (mutable && !variable.mutable) {
    return err({
      what: "Cannot borrow mutably",
      where: nameToken.pos,
      why: `"${nameToken.name}" was declared with let, so it cannot be borrowed with &mut`,
      fix: `Declare it with let mut ${nameToken.name} = ...; to allow &mut`,
    });
  }
  return ok({
    value: { target: variable.id, mutable },
    next: nameIndex + 1,
    scope,
  });
}
