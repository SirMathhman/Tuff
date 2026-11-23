import { undefinedVariable } from "../errors.ts";
import { err, ok } from "../result.ts";
import type { Scope } from "../scope.ts";
import type { NameToken } from "../tokenize.ts";
import type { ParseResult, Parsed } from "./types.ts";

// "*name": the number the reference in `name` points at. `index` points at the
// "*"; `nameToken` is the token after it.
export function parseDeref(
  nameToken: NameToken,
  index: number,
  scope: Scope,
): ParseResult<Parsed> {
  const variable = scope.names.get(nameToken.name);
  if (variable === undefined) {
    return err(undefinedVariable(nameToken.name, nameToken.pos));
  }
  const cell = scope.cells.get(variable.id);
  if (cell === undefined || typeof cell !== "object") {
    return err({
      what: "Not a reference",
      where: nameToken.pos,
      why: `"${nameToken.name}" does not hold a reference`,
      fix: `Only a variable that holds &x or &mut x can be dereferenced`,
    });
  }
  const target = scope.cells.get(cell.target);
  if (target === undefined || typeof target === "object") {
    return err({
      what: "Reference used as a number",
      where: nameToken.pos,
      why: `"*${nameToken.name}" points at a reference, not a number`,
      fix: "Point the reference at a variable that holds a number",
    });
  }
  return ok({ value: target, next: index + 2, scope });
}
