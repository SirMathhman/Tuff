import type { Failure, TuffError } from "./core";
import { fail } from "./core";

/**
 * Reports an assignment to a reference name, which cannot be given another variable.
 *
 * @param where - the offset of the reference's name.
 * @param name - the reference being assigned.
 * @returns a failure describing the reassignment.
 */
export function referenceReassign(
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Cannot reassign reference '${name}'`,
    where,
    "A reference always points to the same variable, so it cannot be given another one.",
    "Declare a new variable with a different name instead.",
  );
}

/**
 * Reports a reference that is not the whole value of a `let`.
 *
 * @param where - the offset of the ampersand.
 * @returns a failure describing the misplaced reference.
 */
export function referenceNotLet(where: number): Failure<TuffError> {
  return fail(
    "'&' is only allowed as the whole value of a 'let' statement",
    where,
    "A reference is bound to a variable by 'let', and cannot be part of a larger expression.",
    "Write 'let name = &variable;', or remove the '&'.",
  );
}

/**
 * Reports a reference declared with `let mut`.
 *
 * @param where - the offset of the reference's name.
 * @param name - the reference being declared.
 * @returns a failure describing the mutable reference.
 */
export function mutableReference(
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Reference '${name}' cannot be declared with 'let mut'`,
    where,
    "A reference always points to the same variable, so it cannot be reassigned.",
    `Declare '${name}' with 'let ${name} = &variable;'.`,
  );
}

/**
 * Reports a reference read without '*'.
 *
 * @param where - the offset of the reference's name.
 * @param name - the reference being read.
 * @returns a failure describing the bare reference.
 */
export function referenceUse(where: number, name: string): Failure<TuffError> {
  return fail(
    `Reference '${name}' cannot be used as a value`,
    where,
    "A reference only gives access to its variable through '*'.",
    `Read the variable with '*${name}' instead.`,
  );
}

/**
 * Reports a dereference of a name that is not a reference.
 *
 * @param where - the offset of the name.
 * @param name - the name being dereferenced.
 * @returns a failure describing the non-reference.
 */
export function notReference(where: number, name: string): Failure<TuffError> {
  return fail(
    `'${name}' is not a reference, so it cannot be dereferenced`,
    where,
    "'*' reads the variable that a reference points to.",
    `Bind '${name}' with 'let ${name} = &variable;', or remove the '*'.`,
  );
}

/**
 * Reports a `&mut` borrow of a variable not declared with `let mut`.
 *
 * @param where - the offset of the variable.
 * @param name - the variable being borrowed.
 * @returns a failure describing the immutable borrow.
 */
export function mutableBorrow(where: number, name: string): Failure<TuffError> {
  return fail(
    `Cannot borrow '${name}' mutably because it was not declared with 'let mut'`,
    where,
    "Only variables declared with 'let mut' can be borrowed with '&mut'.",
    `Declare '${name}' with 'let mut ${name} = ...;' to allow '&mut'.`,
  );
}

/**
 * Reports a reference that conflicts with another reference to the same variable.
 *
 * @param where - the offset of the variable.
 * @param name - the variable being referenced.
 * @returns a failure describing the conflict.
 */
export function referenceOverlap(
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `'${name}' is already referenced in a way that conflicts with this reference`,
    where,
    "A '&mut' reference cannot coexist with any other reference to the same variable.",
    "End the other reference's block, or use '&' for both references.",
  );
}

/**
 * Reports an assignment through a read-only reference.
 *
 * @param where - the offset of the reference's name.
 * @param name - the read-only reference.
 * @returns a failure describing the read-only reference.
 */
export function readOnlyReference(
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Cannot assign through '${name}' because it is a read-only reference`,
    where,
    "Only a reference made with '&mut' can change its variable.",
    `Declare '${name}' with 'let ${name} = &mut variable;'.`,
  );
}

/**
 * Reports a read or assignment of a variable while a reference to it is live.
 *
 * @param where - the offset of the variable.
 * @param name - the variable being used.
 * @param writing - whether the use is an assignment rather than a read.
 * @returns a failure describing the borrowed variable.
 */
export function ownerBorrowed(
  where: number,
  name: string,
  writing: boolean,
): Failure<TuffError> {
  return fail(
    `Cannot ${writing ? "assign to" : "read"} '${name}' while a reference to it is in scope`,
    where,
    "A variable cannot change while a reference to it is in scope, and cannot be read while a '&mut' reference is.",
    `End the reference's block before using '${name}' directly.`,
  );
}
