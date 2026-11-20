import type { Failure, TuffError } from "./core";
import { fail } from "./core";

/**
 * Reports an arithmetic operator applied to a boolean.
 *
 * @param where - the offset of the operator.
 * @param operator - the operator that received a boolean operand.
 * @returns a failure describing the boolean operand.
 */
export function booleanOperand(
  where: number,
  operator: string,
): Failure<TuffError> {
  return fail(
    `Cannot use a boolean with '${operator}'`,
    where,
    "Only numbers can be used with arithmetic or comparison operators; a boolean has no numeric value.",
    "Use a number in place of the boolean, or remove the operator.",
  );
}

/**
 * Reports a variable assigned a value of a different type.
 *
 * @param where - the offset of the variable's name.
 * @param name - the variable being assigned.
 * @param held - the type the variable currently holds.
 * @param assigned - the type of the new value.
 * @returns a failure describing the type mismatch.
 */
export function typeMismatch(
  where: number,
  name: string,
  held: string,
  assigned: string,
): Failure<TuffError> {
  return fail(
    `Cannot assign a ${assigned} to '${name}', which holds a ${held}`,
    where,
    "A variable keeps the type of the value it holds.",
    "Assign a value of the same type, or declare a new variable.",
  );
}

/**
 * Reports a condition that is not a boolean.
 *
 * @param where - the offset of the condition's closing parenthesis.
 * @param keyword - the keyword whose condition it is, such as "if" or "while".
 * @returns a failure describing the non-boolean condition.
 */
export function nonBooleanCondition(
  where: number,
  keyword: string,
): Failure<TuffError> {
  return fail(
    `The condition of '${keyword}' must be a boolean`,
    where,
    "Only a boolean can choose a branch; a number has no truth value.",
    "Use a comparison such as 'x < 5', or a boolean value.",
  );
}

/**
 * Reports a division whose divisor is zero.
 *
 * @param where - the offset of the division operator.
 * @returns a failure describing the division by zero.
 */
export function divisionByZero(where: number): Failure<TuffError> {
  return fail(
    "Division by zero",
    where,
    "A number cannot be divided by zero.",
    "Use a non-zero divisor.",
  );
}

/**
 * Reports a negative sign applied to a boolean.
 *
 * @param where - the offset of the boolean.
 * @returns a failure describing the signed boolean.
 */
export function booleanSign(where: number): Failure<TuffError> {
  return fail(
    "Cannot apply a sign to a boolean",
    where,
    "A sign can only change the value of a number.",
    "Remove the sign, or use a number.",
  );
}
