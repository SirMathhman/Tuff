/**
 * A syntax error: what went wrong, where, why, and how to fix it.
 */
export interface TuffError {
  /** What went wrong, as a short message. */
  what: string;
  /** Zero-based offset of the problem in the source. */
  where: number;
  /** The rule that was broken. */
  why: string;
  /** How to correct the source. */
  fix: string;
}

/**
 * A successful result, holding a value.
 */
export interface Success<T> {
  /** Always true for a success. */
  ok: true;
  /** The value on success. */
  value: T;
}

/**
 * A failed parse, holding the error.
 */
export interface Failure<E> {
  /** Always false for a failure. */
  ok: false;
  /** The error describing the failure. */
  error: E;
}

/**
 * The outcome of parsing: a value, or a failure with an error.
 */
export type Result<T, E> = Success<T> | Failure<E>;

/**
 * The two kinds of opening bracket.
 */
export enum Bracket {
  /** A parenthesized group, closed by `)`. */
  Paren = "(",
  /** A braced block, closed by `}`. */
  Brace = "{",
}

/**
 * Returns the closing character for a bracket.
 *
 * @param bracket - the opening bracket.
 * @returns the matching closing character.
 */
export function closerFor(bracket: Bracket): string {
  return bracket === Bracket.Paren ? ")" : "}";
}

function isSpace(ch: string): boolean {
  return ch.length === 1 && ch.trim() === "";
}

function describe(ch: string): string {
  if (ch === "") return "the end of the input";
  if (isSpace(ch)) return "whitespace";
  return `'${ch}'`;
}

function fail(
  what: string,
  where: number,
  why: string,
  fix: string,
): Failure<TuffError> {
  return { ok: false, error: { what, where, why, fix } };
}

/**
 * Reports a missing operand: a number, variable, or opening bracket.
 * @param source - the program being parsed.
 * @param where - the offset of the unexpected character.
 * @returns a failure describing the missing operand.
 */
export function expectedNumber(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected a number, a variable, '(', or '{' but found ${describe(source.charAt(where))}`,
    where,
    "Every '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' must be followed by an integer, a variable, or a parenthesized or braced expression, and an expression must start with one.",
    "Put an integer, a variable, '(' or '{' at this position, or remove the operator before it.",
  );
}

/**
 * Reports a character that cannot follow a term.
 * @param source - the program being parsed.
 * @param where - the offset of the unexpected character.
 * @param grouped - whether the character is inside brackets.
 * @returns a failure describing the missing operator.
 */
export function expectedOperator(
  source: string,
  where: number,
  grouped: boolean,
): Failure<TuffError> {
  const found = describe(source.charAt(where));
  if (grouped) {
    return fail(
      `Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', '!=', ')', or '}' but found ${found}`,
      where,
      "Two terms can only be combined with '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=', and an opening bracket must be closed by its matching bracket; any other character cannot follow a number.",
      "Insert '+', '-', '*', '/', '<', '>', '<=', '>=', '==', '!=', or a closing bracket here, or remove the extra character.",
    );
  }
  return fail(
    `Expected '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' but found ${found}`,
    where,
    "Two numbers can only be combined with '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!='; any other character cannot follow a number.",
    "Insert '+', '-', '*', '/', '<', '>', '<=', '>=', '==', or '!=' between the numbers, or remove the extra character.",
  );
}

/**
 * Reports input that ends before a bracket is closed.
 * @param source - the program being parsed.
 * @param where - the offset where the input ends.
 * @param bracket - the opening bracket that is still open.
 * @returns a failure describing the missing closing bracket.
 */
export function expectedClose(
  source: string,
  where: number,
  bracket: Bracket,
): Failure<TuffError> {
  const closer = closerFor(bracket);
  const noun = bracket === Bracket.Paren ? "parenthesized" : "braced";
  return fail(
    `Expected '${closer}' but found ${describe(source.charAt(where))}`,
    where,
    `Every '${bracket}' must be closed by a matching '${closer}'.`,
    `Add a '${closer}' at the end of the ${noun} expression.`,
  );
}

/**
 * Reports a closing bracket that does not match the innermost opening bracket.
 * @param source - the program being parsed.
 * @param where - the offset of the mismatched closing bracket.
 * @param bracket - the opening bracket that needed closing.
 * @returns a failure describing the mismatch.
 */
export function expectedMismatch(
  source: string,
  where: number,
  bracket: Bracket,
): Failure<TuffError> {
  const closer = closerFor(bracket);
  return fail(
    `Expected '${closer}' to close '${bracket}' but found ${describe(source.charAt(where))}`,
    where,
    "Each opening bracket must be closed by its own kind of bracket: '(' by ')' and '{' by '}'.",
    `Replace this character with '${closer}', or change the opening bracket.`,
  );
}

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
 * Reports a `let` without a name after it.
 * @param source - the program being parsed.
 * @param where - the offset where the name should start.
 * @returns a failure describing the missing name.
 */
export function expectedVariableName(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected a variable name after 'let' but found ${describe(source.charAt(where))}`,
    where,
    "A 'let' statement names the variable it declares, as in 'let x = 1;'.",
    "Write a name made of letters after 'let'.",
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
 * Reports a `let` name that is not followed by `=`.
 * @param source - the program being parsed.
 * @param where - the offset where `=` should appear.
 * @param name - the name that was declared.
 * @returns a failure describing the missing `=`.
 */
export function expectedEquals(
  source: string,
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Expected '=' after 'let ${name}' but found ${describe(source.charAt(where))}`,
    where,
    "A 'let' statement gives its variable a value with '='.",
    "Insert '=' between the name and its value.",
  );
}

/**
 * Reports a statement that does not end with `;`.
 * @param source - the program being parsed.
 * @param where - the offset where `;` should appear.
 * @returns a failure describing the missing `;`.
 */
export function expectedSemicolon(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected ';' but found ${describe(source.charAt(where))}`,
    where,
    "Every 'let' statement must end with ';'.",
    "Add ';' after the value.",
  );
}

/**
 * Reports a `let` that does not start a statement.
 * @param where - the offset of the `let`.
 * @returns a failure describing the misplaced `let`.
 */
export function letNotAllowed(where: number): Failure<TuffError> {
  return fail(
    "'let' is only allowed at the start of a statement",
    where,
    "A 'let' statement can only begin the program, a block, or follow a ';', so it cannot be part of a larger expression.",
    "Move the 'let' statement out of the parentheses or operator, or remove the 'let'.",
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

/**
 * Reports a block whose last item is a statement rather than an expression.
 *
 * @param where - the offset of the block's closing brace.
 * @returns a failure describing the block that ends in a statement.
 */
export function blockEndsWithStatement(where: number): Failure<TuffError> {
  return fail(
    "A block must end with an expression, not a statement",
    where,
    "The value of a block is its final expression, so a block that ends with a statement has no value.",
    "Add an expression after the last statement, such as the variable's name.",
  );
}

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
 * Reports an `if` that is not followed by a parenthesized condition.
 *
 * @param source - the program being parsed.
 * @param where - the offset of the character that should be `(`.
 * @returns a failure describing the missing parenthesis.
 */
export function expectedIfParen(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected '(' after 'if' but found ${describe(source.charAt(where))}`,
    where,
    "An 'if' condition is written in parentheses, as in 'if (x < 5)'.",
    "Write '(' directly after 'if'.",
  );
}

/**
 * Reports an `if` expression with no `else` branch.
 *
 * @param source - the program being parsed.
 * @param where - the offset where `else` should appear.
 * @returns a failure describing the missing else branch.
 */
export function expectedElse(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected 'else' but found ${describe(source.charAt(where))}`,
    where,
    "An 'if' expression needs an 'else' branch so that it always has a value.",
    "Add 'else' followed by a value.",
  );
}

/**
 * Reports an `if` whose condition is not a boolean.
 *
 * @param where - the offset of the condition's closing parenthesis.
 * @returns a failure describing the non-boolean condition.
 */
export function nonBooleanCondition(where: number): Failure<TuffError> {
  return fail(
    "The condition of 'if' must be a boolean",
    where,
    "Only a boolean can choose a branch; a number has no truth value.",
    "Use a comparison such as 'x < 5', or a boolean value.",
  );
}

/**
 * Reports `else` written where no `if` is waiting for it.
 *
 * @param where - the offset of `else`.
 * @returns a failure describing the misplaced `else`.
 */
export function elseNotAllowed(where: number): Failure<TuffError> {
  return fail(
    "'else' must follow the then-branch of an 'if'",
    where,
    "'else' only appears between the branches of an 'if' expression.",
    "Remove 'else', or write an 'if' before it.",
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
 * Reports a comparison written directly after another comparison.
 *
 * @param where - the offset of the second comparison operator.
 * @returns a failure describing the chained comparison.
 */
export function chainedComparison(where: number): Failure<TuffError> {
  return fail(
    "Comparisons cannot be chained",
    where,
    "A comparison produces a boolean, which cannot be compared again in the same expression.",
    "Remove one of the comparisons, or compare the values in separate statements.",
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
/**
 * Reports a `;` that does not end a `let` or assignment.
 *
 * @param where - the offset of the `;`.
 * @returns a failure describing the stray `;`.
 */
export function unexpectedSemicolon(where: number): Failure<TuffError> {
  return fail(
    "Unexpected ';' outside a let statement",
    where,
    "';' only ends a 'let' statement.",
    "Remove the ';', or start the statement with 'let name ='.",
  );
}
