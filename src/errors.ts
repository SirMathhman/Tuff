/**
 * A syntax error: what went wrong, where, why, and how to fix it.
 */
export interface TuffError {
  what: string;
  where: number;
  why: string;
  fix: string;
}

interface Success<T> {
  ok: true;
  value: T;
}

/**
 * A failed parse, holding the error.
 */
export interface Failure<E> {
  ok: false;
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
  Paren = "(",
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
    "Every '+', '-', or '*' must be followed by an integer, a variable, or a parenthesized or braced expression, and an expression must start with one.",
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
      `Expected '+', '-', '*', ')', or '}' but found ${found}`,
      where,
      "Two terms can only be combined with '+', '-', or '*', and an opening bracket must be closed by its matching bracket; any other character cannot follow a number.",
      "Insert '+', '-', '*', or a closing bracket here, or remove the extra character.",
    );
  }
  return fail(
    `Expected '+', '-', or '*' but found ${found}`,
    where,
    "Two numbers can only be combined with '+', '-', or '*'; any other character cannot follow a number.",
    "Insert '+', '-', or '*' between the numbers, or remove the extra character.",
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
 * @returns a failure describing the reserved name.
 */
export function reservedName(where: number): Failure<TuffError> {
  return fail(
    "'let' is a keyword and cannot be a variable name",
    where,
    "'let' starts a declaration, so it cannot also name a variable.",
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
 * Reports a `;` that does not end a `let` or assignment.
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
