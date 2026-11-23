export interface TuffError {
  // What went wrong, in a few words.
  what: string;
  // Zero-based character offset in the source where the problem is.
  where: number;
  // The rule that was broken.
  why: string;
  // What the caller should change to make the source valid.
  fix: string;
}

// Reported when a number is required but the source ends. `end` is the source
// length.
export function missingNumberAtEnd(end: number): TuffError {
  return {
    what: "Missing number",
    where: end,
    why: "The expression ends where a number is required",
    fix: "Add a number after the last operator, or delete that operator",
  };
}

// Reported when a number is required but the token found is `found`.
export function missingNumber(where: number, found: string): TuffError {
  if (found === ")" || found === "}") {
    const noun = groupNoun(found);
    return {
      what: "Missing number",
      where,
      why: `Found "${found}" where a number is required`,
      fix: `Put a number inside the ${noun}, or delete the ${noun}`,
    };
  }
  return {
    what: "Missing number",
    where,
    why: `Found "${found}" where a number is required`,
    fix: "Put a number before this operator, or remove the operator before it",
  };
}

// Plural name of the bracket pair that `symbol` belongs to, for messages.
export function groupNoun(symbol: string): string {
  return symbol === "(" || symbol === ")" ? "parentheses" : "braces";
}

// Singular name of the bracket pair that `symbol` belongs to, for messages.
export function groupName(symbol: string): string {
  return symbol === "(" || symbol === ")" ? "parenthesis" : "brace";
}

// Reported when a token follows a complete expression with nothing to join it.
// Two numbers next to each other get a missing operator. A ";" or "=" here is
// reported as its own mistake.
export function missingOperator(where: number, found: string): TuffError {
  if (found === ";") {
    return {
      what: "Unexpected semicolon",
      where,
      why: 'A ";" may only end a let statement',
      fix: 'Delete this ";", or put a let statement before it',
    };
  }
  if (found === "=") {
    return {
      what: "Unexpected =",
      where,
      why: '"=" may only follow a variable name in a let statement or an assignment',
      fix: 'Delete this "=", or write the assignment as name = value;',
    };
  }
  return {
    what: "Missing operator",
    where,
    why: "Two numbers appear next to each other with no operator between them",
    fix: "Insert +, -, or * between the numbers, or delete one of them",
  };
}

// Reported when `let` is not followed by a name because the source ends.
export function letNameAtEnd(end: number): TuffError {
  return {
    what: "Missing name",
    where: end,
    why: "let must be followed by a variable name",
    fix: "Add a name after let, such as let x = 1;",
  };
}

// Reported when `let` is followed by `found`, which is not a name.
export function letNotName(where: number, found: string): TuffError {
  return {
    what: "Missing name",
    where,
    why: `Found "${found}" where a variable name is required`,
    fix: 'Use a name made of letters and "_" after let, such as let x = 1;',
  };
}

// Reported when a statement does not end with ";". `subject` names the statement
// in the message. `where` is the offset of the token where the ";" was expected,
// or the source length.
export function missingSemicolon(where: number, subject: string): TuffError {
  return {
    what: "Missing ;",
    where,
    why: `${subject} must end with ";"`,
    fix: 'Add ";" after its value',
  };
}

// Reported when a name is used but no variable with that name is visible.
export function undefinedVariable(name: string, where: number): TuffError {
  return {
    what: "Undefined variable",
    where,
    why: `"${name}" has not been declared`,
    fix: `Declare it first with let ${name} = ...;, or fix the spelling`,
  };
}

// Reported when a variable that holds a reference is used where a number is
// required.
export function referenceAsNumber(name: string, where: number): TuffError {
  return {
    what: "Reference used as a number",
    where,
    why: `"${name}" holds a reference, not a number`,
    fix: `Write *${name} to use the value it points at`,
  };
}

// Reported when a boolean is used where arithmetic needs a number.
export function booleanAsNumber(where: number, text: string): TuffError {
  return {
    what: "Boolean used as a number",
    where,
    why: `"${text}" is a boolean, not a number`,
    fix: "Use a number instead of the boolean, or drop the operator",
  };
}

// Reported when a number is used as an operand of "||". `where` is the offset of
// the "||".
export function numberAsBoolean(where: number): TuffError {
  return {
    what: "Number used as a boolean",
    where,
    why: 'Both sides of "||" must be booleans',
    fix: 'Use a boolean on each side of "||", or remove the number',
  };
}
