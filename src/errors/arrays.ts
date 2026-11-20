import type { Failure, TuffError } from "./core";
import { fail } from "./core";

/**
 * Reports an array literal whose elements do not all have one type.
 *
 * @param where - the offset of the element that differs.
 * @returns a failure describing the mixed element types.
 */
export function arrayMixed(where: number): Failure<TuffError> {
  return fail(
    "The elements of an array must all be integers or all be booleans",
    where,
    "An array holds values of a single type.",
    "Make every element the same type.",
  );
}

/**
 * Reports an array literal that is not the value of a let.
 *
 * @param where - the offset of the opening bracket.
 * @returns a failure describing the unbound array.
 */
export function arrayNotBound(where: number): Failure<TuffError> {
  return fail(
    "An array literal must be the value of a 'let' statement",
    where,
    "An array is bound to a name with 'let', so it has a name to index.",
    "Write 'let name = [...];'.",
  );
}

/**
 * Reports a use of an array name that moved away earlier.
 *
 * @param where - the offset of the name.
 * @param name - the moved array.
 * @returns a failure describing the moved array.
 */
export function arrayMoved(where: number, name: string): Failure<TuffError> {
  return fail(
    `Array '${name}' was moved by an earlier 'let' and cannot be used`,
    where,
    "A 'let' that copies an array moves it, so the old name no longer holds it.",
    `Use the new name instead of '${name}'.`,
  );
}

/**
 * Reports an array name used as a plain value rather than indexed or bound.
 *
 * @param where - the offset of the name.
 * @param name - the array name.
 * @returns a failure describing the misuse.
 */
export function arrayNotUsable(
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Array '${name}' can only be indexed, or moved into a new name with 'let'`,
    where,
    "An array is not a number or boolean, so it cannot be an operand.",
    `Write '${name}[index]' to read an element.`,
  );
}

/**
 * Reports an index that is not an integer.
 *
 * @param where - the offset of the index.
 * @returns a failure describing the non-integer index.
 */
export function indexNotInteger(where: number): Failure<TuffError> {
  return fail(
    "An array index must be an integer",
    where,
    "Only an integer can select an element.",
    "Use an integer index, such as '0'.",
  );
}

/**
 * Reports an index outside the array.
 *
 * @param where - the offset of the index.
 * @param index - the index used.
 * @param length - the number of elements.
 * @returns a failure describing the out-of-range index.
 */
export function indexOutOfRange(
  where: number,
  index: number,
  length: number,
): Failure<TuffError> {
  return fail(
    `Index ${index} is outside the array of ${length} elements`,
    where,
    "Indexes run from 0 to one less than the number of elements.",
    `Use an index from 0 to ${length - 1}.`,
  );
}
