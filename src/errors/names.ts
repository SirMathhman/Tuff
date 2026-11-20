import type { Failure, TuffError } from "./core";
import { describe, fail } from "./core";

/**
 * Reports a name that is not declared in any enclosing scope.
 * @param where - the offset of the name.
 * @param name - the undeclared name.
 * @returns a failure describing the undefined name.
 */
export function undefinedName(where: number, name: string): Failure<TuffError> {
  return fail(
    `Name '${name}' is not defined`,
    where,
    "A variable is only visible inside the block where it was declared with 'let', and inside blocks nested in that block.",
    `Declare it with 'let ${name} = ...;' before using it, in this block or an enclosing one.`,
  );
}

/**
 * Reports a missing variable name after the token that needs one.
 * @param source - the program being parsed.
 * @param where - the offset where the name should start.
 * @param token - the token before the name: 'let', '&', or '*'.
 * @returns a failure describing the missing name.
 */
export function expectedVariableName(
  source: string,
  where: number,
  token: string,
): Failure<TuffError> {
  const why =
    token === "let"
      ? "A 'let' statement names the variable it declares, as in 'let x = 1;'."
      : `A '${token}' must be followed by the name of a variable.`;
  return fail(
    `Expected a variable name after '${token}' but found ${describe(source.charAt(where))}`,
    where,
    why,
    `Write a name made of letters after '${token}'.`,
  );
}

/**
 * Reports a keyword used as a variable name.
 * @param where - the offset of the keyword.
 * @param name - the keyword that was used.
 * @returns a failure describing the reserved name.
 */
export function reservedName(where: number, name: string): Failure<TuffError> {
  return fail(
    `'${name}' is a keyword and cannot be a variable name`,
    where,
    `'${name}' has a fixed meaning, so it cannot also name a variable.`,
    "Choose a different name.",
  );
}

/**
 * Reports an assignment to a variable not declared with `let mut`.
 * @param where - the offset of the variable.
 * @param name - the variable being assigned.
 * @returns a failure describing the immutable variable.
 */
export function notMutable(where: number, name: string): Failure<TuffError> {
  return fail(
    `Cannot assign to '${name}' because it was not declared with 'let mut'`,
    where,
    "Only variables declared with 'let mut' can be reassigned.",
    `Declare '${name}' with 'let mut ${name} = ...;' to allow reassignment.`,
  );
}
