import type { Failure, TuffError } from "./core";
import { describe, fail } from "./core";

/**
 * Reports a case whose value is not a boolean or integer literal.
 *
 * @param source - the program being parsed.
 * @param where - the offset where the literal should start.
 * @returns a failure describing the missing literal.
 */
export function expectedCase(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected 'true', 'false', or a number after 'case' but found ${describe(source.charAt(where))}`,
    where,
    "A case matches a boolean or integer literal.",
    "Write a literal such as 'true', '0', or '3' after 'case'.",
  );
}

/**
 * Reports a case written after the wildcard `_`, which would never run.
 *
 * @param where - the offset of the case keyword.
 * @returns a failure describing the unreachable case.
 */
export function caseAfterWildcard(where: number): Failure<TuffError> {
  return fail(
    "A 'case' cannot follow the '_' case",
    where,
    "The '_' case matches every value, so a case after it would never run.",
    "Move '_' to the last case, or remove the case after it.",
  );
}

/**
 * Reports a match whose value matches none of its cases.
 *
 * @param where - the offset of the `match` keyword.
 * @returns a failure describing the unmatched value.
 */
export function noMatch(where: number): Failure<TuffError> {
  return fail(
    "No case matches the value of this 'match'",
    where,
    "A match must have a case for the value it is given, because it needs a value.",
    "Add a case for the value, such as 'case 0 => ...;'.",
  );
}
