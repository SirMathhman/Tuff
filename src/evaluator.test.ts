import { evalProgram } from "./evaluator/index.js";
import { parse } from "./parser/index.js";
import { tokenize } from "./core/lexer.js";
import type { EvalError, Result } from "./core/errors.js";

/** Tokenize, parse, and evaluate a source program in one step. */
function evalSource(source: string): Result<number, EvalError> {
  const tokens = tokenize(source);
  if (!tokens.ok) {
    return tokens;
  }
  const program = parse(tokens.value, source);
  if (!program.ok) {
    return program;
  }
  return evalProgram(program.value);
}

test("evalProgram returns the value of a return statement", () => {
  expect(evalSource("return 1;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram evaluates a bare top-level number literal to its value", () => {
  expect(evalSource("100")).toEqual({ ok: true, value: 100 });
});

test("evalProgram evaluates a suffixed integer literal to its value", () => {
  expect(evalSource("100U8")).toEqual({ ok: true, value: 100 });
});

test("evalProgram returns an InvalidNumberSuffix error for a lowercase integer suffix", () => {
  expect(evalSource("100u8")).toEqual({
    ok: false,
    error: { kind: "InvalidNumberSuffix", suffix: "u8", position: 3 },
  });
});

test("evalProgram evaluates a suffixed integer literal in a return statement", () => {
  expect(evalSource("return 100U8;")).toEqual({ ok: true, value: 100 });
});

test("evalProgram promotes same-type integer addition to that type", () => {
  expect(evalSource("return 1U8 + 2U8;")).toEqual({ ok: true, value: 3 });
});

test("evalProgram promotes mixed integer addition to the wider type", () => {
  expect(evalSource("return 1U8 + 2U16;")).toEqual({ ok: true, value: 3 });
});

test("evalProgram promotes integer + Int addition to the concrete type", () => {
  expect(evalSource("return 1U8 + 2;")).toEqual({ ok: true, value: 3 });
});

test("evalProgram promotes concrete integer addition to the range-based least upper bound", () => {
  expect(evalSource("return 1U8 + 1I32;")).toEqual({ ok: true, value: 2 });
  expect(evalSource("return 1U32 + 1I32;")).toEqual({ ok: true, value: 2 });
  expect(evalSource("return 1USize + 1U8;")).toEqual({ ok: true, value: 2 });
  expect(evalSource("return 1USize + 1U64;")).toEqual({ ok: true, value: 2 });
});

test("evalProgram returns a TypeMismatch error when + has no common integer type", () => {
  expect(evalSource("return 1U64 + 1I64;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "+", expected: "u64", actual: "i64", position: 7 },
  });
});

test("evalProgram compares suffixed integers with an ordering operator", () => {
  expect(evalSource("return 1U8 < 2U8;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram compares suffixed integers with equality subtype-aware", () => {
  expect(evalSource("return 1U8 == 1U8;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1U8 == 2U8;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram returns a TypeMismatch error when == compares unrelated concrete ints", () => {
  expect(evalSource("return 1U8 == 1U16;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "==", expected: "u8", actual: "u16", position: 7 },
  });
});

test("evalProgram returns an IntegerOutOfRange error for a literal outside its type's range", () => {
  expect(evalSource("return 300U8;")).toEqual({
    ok: false,
    error: { kind: "IntegerOutOfRange", type: "u8", value: 300, position: 7 },
  });
});

test("evalProgram accepts an unsuffixed integer literal within the Int span", () => {
  expect(evalSource("return 2147483648;")).toEqual({ ok: true, value: 2147483648 });
});

// The spec's 2^64 boundary is not representable in a JS double (it rounds to
// the same value as the 2^64 - 1 bound), so use 2^65, which is representable
// and unambiguously above the Int span.
test("evalProgram returns an IntegerOutOfRange error for an unsuffixed integer literal above the Int span", () => {
  expect(evalSource("return 36893488147419103232;")).toEqual({
    ok: false,
    error: { kind: "IntegerOutOfRange", type: "int", value: 36893488147419103000, position: 7 },
  });
});

test("evalProgram returns a TypeMismatch error when assigning a number to an integer variable", () => {
  expect(evalSource("let mut x = 1U8; x = 2;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "u8", actual: "int", position: 17 },
  });
});

test("evalProgram coerces a bool return to a number", () => {
  expect(evalSource("return true;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return false;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram evaluates an is type-test to 1 when the types match", () => {
  expect(evalSource("100U8 is U8")).toEqual({ ok: true, value: 1 });
});

test("evalProgram evaluates an is type-test to 0 when the types differ", () => {
  expect(evalSource("100U8 is U16")).toEqual({ ok: true, value: 0 });
});

test("evalProgram evaluates an is type-test against Bool", () => {
  expect(evalSource("true is Bool")).toEqual({ ok: true, value: 1 });
  expect(evalSource("1 is Bool")).toEqual({ ok: true, value: 0 });
  expect(evalSource("let x = true; x is Bool")).toEqual({ ok: true, value: 1 });
  expect(evalSource("(100U8 is U8) is Bool")).toEqual({ ok: true, value: 1 });
});

test("evalProgram evaluates an is type-test subtype-aware", () => {
  expect(evalSource("1 is U8")).toEqual({ ok: true, value: 0 });
  expect(evalSource("100 is I32")).toEqual({ ok: true, value: 0 });
  expect(evalSource("100I32 is I32")).toEqual({ ok: true, value: 1 });
  expect(evalSource("100USize is U64")).toEqual({ ok: true, value: 1 });
  expect(evalSource("1U64 is USize")).toEqual({ ok: true, value: 0 });
  expect(evalSource("1.5 is F32")).toEqual({ ok: true, value: 0 });
  expect(evalSource("1.5 is F64")).toEqual({ ok: true, value: 0 });
});

test("evalProgram returns an UnknownType error for an is type-test against the internal supertypes", () => {
  expect(evalSource("1 is Int")).toEqual({
    ok: false,
    error: { kind: "UnknownType", name: "Int", position: 5 },
  });
  expect(evalSource("1.5 is Float")).toEqual({
    ok: false,
    error: { kind: "UnknownType", name: "Float", position: 7 },
  });
});
test("evalProgram binds is tighter than comparisons", () => {
  expect(evalSource("100U8 is U8 == true")).toEqual({ ok: true, value: 1 });
});

test("evalProgram evaluates a parenthesized expression", () => {
  expect(evalSource("(1 + 2) + 3")).toEqual({ ok: true, value: 6 });
  expect(evalSource("((true))")).toEqual({ ok: true, value: 1 });
  expect(evalSource("let x = (100U8 is U8); x")).toEqual({ ok: true, value: 1 });
});

test("evalProgram returns an UnknownType error for an is type-test with an unknown type name", () => {
  expect(evalSource("1 is Foo")).toEqual({
    ok: false,
    error: { kind: "UnknownType", name: "Foo", position: 5 },
  });
});

test("evalProgram evaluates an if expression to its else branch when the condition is false", () => {
  expect(evalSource("let x = if (false) 2 else 3; x")).toEqual({ ok: true, value: 3 });
});

test("evalProgram evaluates an if expression to its then branch when the condition is true", () => {
  expect(evalSource("return if (1 < 2) 5 else 6;")).toEqual({ ok: true, value: 5 });
});

test("evalProgram evaluates an else-if chain to the final else branch when all conditions are false", () => {
  expect(evalSource("let x = if (false) 2 else if (false) 3 else 4; x")).toEqual({
    ok: true,
    value: 4,
  });
});

test("evalProgram evaluates a match expression to the first matching arm", () => {
  expect(evalSource("let x = match (1) { case 1 => 2; case _ => 3; }; x")).toEqual({
    ok: true,
    value: 2,
  });
});

test("evalProgram evaluates a match expression to its wildcard arm when no literal arm matches", () => {
  expect(evalSource("let x = match (2) { case 1 => 2; case _ => 3; }; x")).toEqual({
    ok: true,
    value: 3,
  });
});

test("evalProgram evaluates a match expression over a bool scrutinee", () => {
  expect(evalSource("let x = match (true) { case true => 1; case _ => 0; }; x")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram returns a MissingWildcardArm error for a match without a wildcard arm", () => {
  expect(evalSource("let x = match (1) { case 1 => 2; }; x")).toEqual({
    ok: false,
    error: { kind: "MissingWildcardArm", position: 8 },
  });
});

test("evalProgram returns a TypeMismatch error when a match pattern's type differs from the scrutinee's", () => {
  expect(evalSource("let x = match (1) { case true => 2; case _ => 3; }; x")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "case",
      expected: "int",
      actual: "bool",
      position: 25,
    },
  });
});

test("evalProgram returns a TypeMismatch error when a match's arms have different types", () => {
  expect(evalSource("let x = match (1) { case 1 => 2; case _ => true; }; x")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "match",
      expected: "int",
      actual: "bool",
      position: 33,
    },
  });
});

test("evalProgram returns a TypeMismatch error when an if expression's branches have different types", () => {
  expect(evalSource("let x = if (true) 1 else true; x")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "if",
      expected: "int",
      actual: "bool",
      position: 8,
    },
  });
});

test("evalProgram adds with a compound += assignment", () => {
  expect(evalSource("let mut x = 1; x += 2; return x;")).toEqual({ ok: true, value: 3 });
});

test("evalProgram returns an ImmutableAssignment error for += on a non-mut variable", () => {
  expect(evalSource("let x = 1; x += 2; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", position: 11 },
  });
});

test("evalProgram returns a TypeMismatch error when assigning a bool to a number variable", () => {
  expect(evalSource("let mut x = 0; x = true; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "int", actual: "bool", position: 15 },
  });
});

test("evalProgram returns a TypeMismatch error when assigning a number to a bool variable", () => {
  expect(evalSource("let mut x = true; x = 0; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "bool", actual: "int", position: 18 },
  });
});

test("evalProgram allows assigning a value of the same type", () => {
  expect(evalSource("let mut x = 0; x = 1; return x;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("let mut x = true; x = false; return x;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram returns a TypeMismatch error for += on a bool variable", () => {
  expect(evalSource("let mut x = true; x += 1; return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "number", actual: "bool", position: 18 },
  });
});

test("evalProgram adds with a compound += assignment across concrete integer types", () => {
  expect(evalSource("let mut x = 0U16; x += 1U8; return x;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram adds with a compound += assignment on a float variable", () => {
  expect(evalSource("let mut x = 1.5; x += 0.5; return x;")).toEqual({ ok: true, value: 2 });
});

test("evalProgram allows assigning a concrete integer to an Int variable", () => {
  expect(evalSource("let mut x = 1; x = 1U8; return x;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram returns a TypeMismatch error when assigning an Int to a concrete integer variable", () => {
  expect(evalSource("let mut y = 1U8; y = 1; return y;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "y", expected: "u8", actual: "int", position: 17 },
  });
});

test("evalProgram type-checks a never-executed if branch", () => {
  expect(evalSource("let mut x = 0; if (false) { x = true; } return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "int", actual: "bool", position: 28 },
  });
});

test("evalProgram type-checks a never-executed else branch", () => {
  expect(evalSource("let mut x = 0; if (true) { x = 1; } else { x = true; } return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "int", actual: "bool", position: 43 },
  });
});

test("evalProgram type-checks a while body", () => {
  expect(evalSource("let mut x = 0; while (false) { x = true; } return x;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", expected: "int", actual: "bool", position: 31 },
  });
});

// Coverage for the numeric-coercibility check on return values and loop/if conditions.
test("evalProgram returns a TypeMismatch error when returning a non-numeric value", () => {
  expect(evalSource("let a = [1]; return a;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "return",
      expected: "number",
      actual: "array<int>",
      position: 20,
    },
  });
  expect(evalSource("let x = 1; let p = &x; return p;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "return",
      expected: "number",
      actual: "ptr<int>",
      position: 30,
    },
  });
});
test("evalProgram returns a TypeMismatch error for a non-numeric if condition", () => {
  expect(evalSource("let a = [1]; if (a) { return 2; } return 1;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "if",
      expected: "bool",
      actual: "array<int>",
      position: 17,
    },
  });
});
test("evalProgram returns a TypeMismatch error for a non-numeric while condition", () => {
  expect(evalSource("let a = [1]; while (a) { } return 1;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "while",
      expected: "bool",
      actual: "array<int>",
      position: 20,
    },
  });
});

test("evalProgram returns a TypeMismatch error for an integer if condition", () => {
  expect(evalSource("if (1) { return 2; } return 1;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "if", expected: "bool", actual: "int", position: 4 },
  });
});

test("evalProgram compares with a subtype-aware ==", () => {
  expect(evalSource("return 1 == 1;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1 == 2;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 == 1U8;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return true == true;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return true == false;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram returns a TypeMismatch error when == compares a bool and a number", () => {
  expect(evalSource("return true == 1;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "==", expected: "bool", actual: "int", position: 7 },
  });
});

test("evalProgram compares with <", () => {
  expect(evalSource("let x = 0; let y = 1; return x < y;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("let x = 1; let y = 0; return x < y;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 < 1;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram compares with <=, >, and >=", () => {
  expect(evalSource("return 1 <= 1;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 2 <= 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 > 0;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1 > 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return 1 >= 1;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 0 >= 1;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram compares with a subtype-aware !=", () => {
  expect(evalSource("return 1 != 2;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return 1 != 1;")).toEqual({ ok: true, value: 0 });
  expect(evalSource("return true != false;")).toEqual({ ok: true, value: 1 });
  expect(evalSource("return true != true;")).toEqual({ ok: true, value: 0 });
});

test("evalProgram returns a TypeMismatch error when chaining ==", () => {
  expect(evalSource("return 1 == 1 == 1;")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "==", expected: "bool", actual: "int", position: 7 },
  });
});

test("evalProgram runs the else branch when the if condition is false", () => {
  expect(evalSource("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;")).toEqual({
    ok: true,
    value: 2,
  });
});

test("evalProgram runs the then branch when the if condition is true", () => {
  expect(evalSource("let mut x = 0; if (true) { x = 1; } else { x = 2; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram skips an if without else when the condition is false", () => {
  expect(evalSource("let mut x = 0; if (false) { x = 1; } return x;")).toEqual({
    ok: true,
    value: 0,
  });
});

test("evalProgram scopes if branches like blocks", () => {
  expect(evalSource("let x = 1; if (true) { let x = 2; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram shadows a variable in an inner block and restores it after", () => {
  expect(evalSource("let x = 1; { let x = 2; } return x;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram keeps an inner-block assignment to a shadowed variable local", () => {
  expect(evalSource("let mut x = 1; { let mut x = 2; x = 3; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram loops with a while statement", () => {
  expect(evalSource("let mut x = 0; while (x < 4) { x += 1; } return x;")).toEqual({
    ok: true,
    value: 4,
  });
});

test("evalProgram skips a while body when the condition is false", () => {
  expect(evalSource("let mut x = 0; while (false) { x = 1; } return x;")).toEqual({
    ok: true,
    value: 0,
  });
});

test("evalProgram scopes while bodies like blocks", () => {
  expect(evalSource("let x = 1; while (false) { let x = 2; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test("evalProgram allows a block without a return", () => {
  expect(evalSource("{ let x = 1; } return 2;")).toEqual({ ok: true, value: 2 });
});

test("evalProgram short-circuits statements after a return", () => {
  expect(evalSource("return 1; let x = 2;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram returns a MissingReturn error when no return statement is present", () => {
  expect(evalSource("let x = 1;")).toEqual({ ok: false, error: { kind: "MissingReturn" } });
});

test("evalProgram returns an ImmutableAssignment error with the variable name and position", () => {
  expect(evalSource("let x = 0; x = 1; return x;")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", position: 11 },
  });
});

test("evalProgram returns an UnknownIdentifier error with the variable name and position", () => {
  expect(evalSource("return y;")).toEqual({
    ok: false,
    error: { kind: "UnknownIdentifier", name: "y", position: 7 },
  });
});

test('evalProgram sums a for loop over a range: "let mut sum = 0; for (i in 0..4) { sum += i; } return sum;"', () => {
  expect(evalSource("let mut sum = 0; for (i in 0..4) { sum += i; } return sum;")).toEqual({
    ok: true,
    value: 6,
  });
});

test("evalProgram sums a for loop over a range stored in a variable", () => {
  expect(
    evalSource("let mut sum = 0; let range = 0..4; for (i in range) { sum += i; } return sum;"),
  ).toEqual({ ok: true, value: 6 });
});

test("evalProgram returns a TypeMismatch error when the for range is not a range", () => {
  expect(evalSource("let x = 1; for (i in x) { } return 1;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "in",
      expected: "range<integer>",
      actual: "int",
      position: 21,
    },
  });
});

test("evalProgram returns a TypeMismatch error for a non-number range bound", () => {
  expect(evalSource("let r = [1]..2; return 1;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "..",
      expected: "number",
      actual: "array<int>",
      position: 8,
    },
  });
});

test("evalProgram reports the range bound, not the loop, for a non-number bound in a for range", () => {
  expect(evalSource("for (i in [1]..2) { } return 1;")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "..",
      expected: "number",
      actual: "array<int>",
      position: 10,
    },
  });
});

test('evalProgram returns 100 for "let x = 100; x" (a bare final expression is the result)', () => {
  expect(evalSource("let x = 100; x")).toEqual({ ok: true, value: 100 });
});

test('evalProgram returns 3 for "1 + 2" (a bare literal expression is the result)', () => {
  expect(evalSource("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('evalProgram returns 1 for "let x = 1; x;" (a trailing semicolon is allowed)', () => {
  expect(evalSource("let x = 1; x;")).toEqual({ ok: true, value: 1 });
});

test("evalProgram returns a TypeMismatch error when the final expression is not numeric", () => {
  expect(evalSource("let a = [1]; a")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "return",
      expected: "number",
      actual: "array<int>",
      position: 13,
    },
  });
});

test("evalProgram returns an UnexpectedStatement error when a bare expression is not final", () => {
  expect(evalSource("let x = 1; x; let y = 2; return y;")).toEqual({
    ok: false,
    error: { kind: "UnexpectedStatement", statement: "x;", position: 11 },
  });
});
