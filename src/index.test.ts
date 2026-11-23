import { expect, test } from "bun:test";
import { interpretTuff, type TuffError } from "./index.ts";
import { ok } from "./errors.ts";

function expectErrorKind(source: string, kind: TuffError["kind"]): void {
  const result = interpretTuff(source);

  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.kind).toBe(kind);
}

test("interpretTuff('1') returns Ok(1)", () => {
  expect(interpretTuff("1")).toEqual(ok(1));
});

test("interpretTuff('1 + 2') returns Ok(3)", () => {
  expect(interpretTuff("1 + 2")).toEqual(ok(3));
});

test("interpretTuff('2 + 3 - 4') returns Ok(1)", () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual(ok(1));
});

test("interpretTuff('2 * 3 + 4') returns Ok(10)", () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual(ok(10));
});

test("interpretTuff('-5') returns Ok(-5)", () => {
  expect(interpretTuff("-5")).toEqual(ok(-5));
});

test("interpretTuff('1 - -2') returns Ok(3)", () => {
  expect(interpretTuff("1 - -2")).toEqual(ok(3));
});

test("interpretTuff('1+') is an InvalidTerm error", () => {
  expectErrorKind("1+", "InvalidTerm");
});

test("interpretTuff('9007199254740993') is a TermTooLarge error", () => {
  expectErrorKind("9007199254740993", "TermTooLarge");
});

function expectErrorDetails(source: string): void {
  const result = interpretTuff(source);

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.why).not.toBe("");
    expect(result.error.where.index).toBeGreaterThanOrEqual(0);
    expect(result.error.fix).not.toBe("");
  }
}

test("every error has why, where, and fix", () => {
  ["1+", "9007199254740993", "abc"].forEach(expectErrorDetails);
});

test("interpretTuff('99999999999 * 99999999999') is a ResultTooLarge error", () => {
  expectErrorKind("99999999999 * 99999999999", "ResultTooLarge");
});

test("interpretTuff('9007199254740991 + 2 - 2') is a ResultTooLarge error", () => {
  expectErrorKind("9007199254740991 + 2 - 2", "ResultTooLarge");
});

test("interpretTuff('9007199254740991 - 1') returns Ok(9007199254740990)", () => {
  expect(interpretTuff("9007199254740991 - 1")).toEqual(ok(9007199254740990));
});

test("interpretTuff('2 * -3') returns Ok(-6)", () => {
  expect(interpretTuff("2 * -3")).toEqual(ok(-6));
});

test("interpretTuff('- 2 * 3') returns Ok(-6)", () => {
  expect(interpretTuff("- 2 * 3")).toEqual(ok(-6));
});

test("interpretTuff('1 * 2 * 3 - 4 * 5') returns Ok(-14)", () => {
  expect(interpretTuff("1 * 2 * 3 - 4 * 5")).toEqual(ok(-14));
});

test("interpretTuff('2\\t + 3') returns Ok(5)", () => {
  expect(interpretTuff("2\t + 3")).toEqual(ok(5));
});

test("interpretTuff('(2 + 3) * 4') returns Ok(20)", () => {
  expect(interpretTuff("(2 + 3) * 4")).toEqual(ok(20));
});

test("interpretTuff('((1 + 2) * 3)') returns Ok(9)", () => {
  expect(interpretTuff("((1 + 2) * 3)")).toEqual(ok(9));
});

test("interpretTuff('-(2 + 3)') returns Ok(-5)", () => {
  expect(interpretTuff("-(2 + 3)")).toEqual(ok(-5));
});

test("interpretTuff('{ 2 + 3 } * 4') returns Ok(20)", () => {
  expect(interpretTuff("{ 2 + 3 } * 4")).toEqual(ok(20));
});

test("interpretTuff('({ 2 + 3 } * 4)') returns Ok(20)", () => {
  expect(interpretTuff("({ 2 + 3 } * 4)")).toEqual(ok(20));
});

test("interpretTuff('(1 + 2}') is an error", () => {
  expect(interpretTuff("(1 + 2}").ok).toBe(false);
});

test("interpretTuff('()') is an error", () => {
  expect(interpretTuff("()").ok).toBe(false);
});

test("interpretTuff('(1 + 2') is an error", () => {
  expect(interpretTuff("(1 + 2").ok).toBe(false);
});

test("interpretTuff with 50000 nested parentheses returns NestingTooDeep", () => {
  expectErrorKind("(".repeat(50000) + "1" + ")".repeat(50000), "NestingTooDeep");
});

test("interpretTuff with 1000 nested parentheses returns Ok(1)", () => {
  expect(interpretTuff("(".repeat(1000) + "1" + ")".repeat(1000))).toEqual(ok(1));
});

test("NestingTooDeep has why, where, and fix", () => {
  const source = "(".repeat(1001) + "1" + ")".repeat(1001);

  expectErrorDetails(source);
  const result = interpretTuff(source);

  expect(!result.ok && result.error.where.index).toBe(1000);
});

test("interpretTuff with a 100000-term chain returns Ok(100000)", () => {
  expect(interpretTuff(Array(100000).fill("1").join(" + "))).toEqual(ok(100000));
});

function expectWhere(
  source: string,
  kind: TuffError["kind"],
  text: string,
  index: number,
): void {
  const result = interpretTuff(source);

  expect(!result.ok && result.error.kind).toBe(kind);
  expect(!result.ok && result.error.where.text).toBe(text);
  expect(!result.ok && result.error.where.index).toBe(index);
}

test("interpretTuff('{1)') is an InvalidTerm error at the stray ')'", () => {
  expectWhere("{1)", "InvalidTerm", ")", 2);
});

test("interpretTuff('(1 + 2}') reports the '}' at index 4", () => {
  expectWhere("(1 + 2}", "InvalidTerm", "}", 4);
});

test("interpretTuff('{ 1 } }') is an InvalidTerm error at the stray '}'", () => {
  expectWhere("{ 1 } }", "InvalidTerm", "}", 3);
});

test("interpretTuff with 1001 nested braces returns NestingTooDeep at index 1000", () => {
  expectWhere("{".repeat(1001) + "1" + "}".repeat(1001), "NestingTooDeep", "{", 1000);
});

test("interpretTuff with 1000 nested braces returns Ok(1)", () => {
  expect(interpretTuff("{".repeat(1000) + "1" + "}".repeat(1000))).toEqual(ok(1));
});

test("interpretTuff with 50000 nested braces returns NestingTooDeep", () => {
  expectErrorKind("{".repeat(50000) + "1" + "}".repeat(50000), "NestingTooDeep");
});

test("interpretTuff('{ let x = 2 + 3; x } * 4') returns Ok(20)", () => {
  expect(interpretTuff("{ let x = 2 + 3; x } * 4")).toEqual(ok(20));
});

test("interpretTuff('let x = 2; x * 3') returns Ok(6)", () => {
  expect(interpretTuff("let x = 2; x * 3")).toEqual(ok(6));
});

test("interpretTuff inner let shadows an outer name and the outer value is restored", () => {
  expect(interpretTuff("{ let x = 1; let y = { let x = 2; x }; x + y }")).toEqual(ok(3));
});

test("interpretTuff('let x = 1; let x = 2; x') returns Ok(2)", () => {
  expect(interpretTuff("let x = 1; let x = 2; x")).toEqual(ok(2));
});

test("interpretTuff('y') is an UndefinedName error", () => {
  expectErrorKind("y", "UndefinedName");
});

test("interpretTuff('{ let x = 2; }') returns Ok(0), a program made only of statements", () => {
  expect(interpretTuff("{ let x = 2; }")).toEqual(ok(0));
});

test("interpretTuff('let mut x = 0; { x = 1; }') returns Ok(0), a program made only of statements", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; }")).toEqual(ok(0));
});

test("interpretTuff inner shadowing across blocks returns Ok(20)", () => {
  expect(interpretTuff("let a = 1; let b = a + 1; { let a = b * 10; a }")).toEqual(ok(20));
});

test("interpretTuff block scope does not leak", () => {
  expectErrorKind("{ let x = 1; x } + x", "UndefinedName");
});

test("interpretTuff('let x=2; x') returns Ok(2)", () => {
  expect(interpretTuff("let x=2; x")).toEqual(ok(2));
});

test("interpretTuff('1\\n+2') returns Ok(3)", () => {
  expect(interpretTuff("1\n+2")).toEqual(ok(3));
});

test("interpretTuff('let mut x = 0; x = 1; x') returns Ok(1)", () => {
  expect(interpretTuff("let mut x = 0; x = 1; x")).toEqual(ok(1));
});

test("interpretTuff assigning to a name declared without mut is an ImmutableAssignment error", () => {
  expectErrorKind("let x = 0; x = 1; x", "ImmutableAssignment");
});

test("interpretTuff assignment inside a nested block persists after the block", () => {
  expect(interpretTuff("let mut x = 0; let y = { x = 5; x }; x + y")).toEqual(ok(10));
});

test("interpretTuff('let mut x = 0; { x = 1; } x') returns Ok(1)", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } x")).toEqual(ok(1));
});

test("interpretTuff inner let bindings in a statement block are discarded", () => {
  expect(interpretTuff("let mut x = 0; { let mut x = 5; x = 1; } x")).toEqual(ok(0));
});

test("interpretTuff a statement block followed by a name is a statement block", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } x + 1")).toEqual(ok(2));
});

test("interpretTuff a block followed by an operator is a value", () => {
  expect(interpretTuff("{ let x = 2; x } * 4")).toEqual(ok(8));
});

test("interpretTuff assigning to a plain let inside a block is an ImmutableAssignment error", () => {
  expectErrorKind("let x = 1; { x = 2; } x", "ImmutableAssignment");
});

test("interpretTuff with 1001 nested statement blocks returns NestingTooDeep", () => {
  expectErrorKind("let mut x = 0; " + "{ x = 1; ".repeat(1001) + "}".repeat(1001) + " x", "NestingTooDeep");
});

test("interpretTuff assigning to an undeclared name is an UndefinedName error", () => {
  expectErrorKind("x = 1; x", "UndefinedName");
});

test("interpretTuff('if (true) 2 else 3') returns Ok(2)", () => {
  expect(interpretTuff("if (true) 2 else 3")).toEqual(ok(2));
});

test("interpretTuff('if (false) 2 else 3') returns Ok(3)", () => {
  expect(interpretTuff("if (false) 2 else 3")).toEqual(ok(3));
});

test("interpretTuff('if (2) 1 else 0') is a TypeMismatch error", () => {
  expectErrorKind("if (2) 1 else 0", "TypeMismatch");
});

test("interpretTuff('let b = true; if (b) 1 else 2') returns Ok(1)", () => {
  expect(interpretTuff("let b = true; if (b) 1 else 2")).toEqual(ok(1));
});

test("interpretTuff('let mut x = 0; if (true) { x = 1; } else { x = 2; } x') returns Ok(1)", () => {
  expect(interpretTuff("let mut x = 0; if (true) { x = 1; } else { x = 2; } x")).toEqual(ok(1));
});

test("interpretTuff ending in an if statement with statement branches returns Ok(0)", () => {
  expect(interpretTuff("let mut x = 0; if (true) { x = 1; } else { x = 2; }")).toEqual(ok(0));
});

test("interpretTuff an if with statement branches followed by an operator is an InvalidTerm error", () => {
  expectErrorKind("let mut x = 0; if (true) { x = 1; } else { x = 2; } + 1", "InvalidTerm");
});

test("interpretTuff with 1001 nested if branches returns NestingTooDeep", () => {
  expectErrorKind("if (true) ".repeat(1001) + "1 " + " else 2".repeat(1001), "NestingTooDeep");
});

test("interpretTuff a statement block followed by an if statement returns Ok(2)", () => {
  expect(interpretTuff("let mut x = 0; { x = 1; } if (true) { x = 2; } else { x = 3; } x")).toEqual(ok(2));
});

test("interpretTuff('let mut x = 0; if (false) { x = 1; } x') returns Ok(0)", () => {
  expect(interpretTuff("let mut x = 0; if (false) { x = 1; } x")).toEqual(ok(0));
});

test("interpretTuff a block whose first statement is an if returns Ok(1)", () => {
  expect(interpretTuff("let mut x = 0; { if (true) { x = 1; } } x")).toEqual(ok(1));
});

test("interpretTuff: 1 < 2 returns Ok(1)", () => {
  expect(interpretTuff("1 < 2")).toEqual(ok(1));
});

test("interpretTuff: 2 <= 1 returns Ok(0)", () => {
  expect(interpretTuff("2 <= 1")).toEqual(ok(0));
});

test("interpretTuff: 1 + 2 < 4 returns Ok(1)", () => {
  expect(interpretTuff("1 + 2 < 4")).toEqual(ok(1));
});

test("interpretTuff: 1 != 1 returns Ok(0)", () => {
  expect(interpretTuff("1 != 1")).toEqual(ok(0));
});

test("interpretTuff: a comparison as an if condition returns Ok(5)", () => {
  expect(interpretTuff("let b = 3 >= 3; if (b) 5 else 6")).toEqual(ok(5));
});

test("interpretTuff: a private-use character U+E000 is an InvalidTerm error", () => {
  expectErrorKind("1  2", "InvalidTerm");
});

test("interpretTuff: a private-use character U+E001 is an InvalidTerm error", () => {
  expectErrorKind("1  2", "InvalidTerm");
});

test("interpretTuff: a private-use character U+E002 is an InvalidTerm error", () => {
  expectErrorKind("1  2", "InvalidTerm");
});

test("interpretTuff: a private-use character U+E003 is an InvalidTerm error", () => {
  expectErrorKind("1  2", "InvalidTerm");
});

test("interpretTuff: 1 <= 2 returns a value", () => {
  expect(interpretTuff("1 <= 2").ok).toBe(true);
});

test("interpretTuff: 1 >= 2 returns a value", () => {
  expect(interpretTuff("1 >= 2").ok).toBe(true);
});

test("interpretTuff: 1 == 2 returns a value", () => {
  expect(interpretTuff("1 == 2").ok).toBe(true);
});

test("interpretTuff: 1 != 2 returns a value", () => {
  expect(interpretTuff("1 != 2").ok).toBe(true);
});

test("interpretTuff: 1 < 2 returns a value", () => {
  expect(interpretTuff("1 < 2").ok).toBe(true);
});

test("interpretTuff: 1 > 2 returns a value", () => {
  expect(interpretTuff("1 > 2").ok).toBe(true);
});

test("interpretTuff: 1 <= 2 <= 3 is an InvalidTerm error", () => {
  expectErrorKind("1 <= 2 <= 3", "InvalidTerm");
});

test("interpretTuff: true && false returns Ok(0)", () => {
  expect(interpretTuff("true && false")).toEqual(ok(0));
});

test("interpretTuff: true || false returns Ok(1)", () => {
  expect(interpretTuff("true || false")).toEqual(ok(1));
});

test("interpretTuff: !true returns Ok(0)", () => {
  expect(interpretTuff("!true")).toEqual(ok(0));
});

test("interpretTuff: 1 < 2 && 3 < 4 returns Ok(1)", () => {
  expect(interpretTuff("1 < 2 && 3 < 4")).toEqual(ok(1));
});

test("interpretTuff: false && 1 short-circuits and returns Ok(0)", () => {
  expect(interpretTuff("false && 1")).toEqual(ok(0));
});

test("interpretTuff: true || undeclared short-circuits and returns Ok(1)", () => {
  expect(interpretTuff("true || undeclared")).toEqual(ok(1));
});

test("interpretTuff: !1 is a TypeMismatch error", () => {
  expectErrorKind("!1", "TypeMismatch");
});

test("interpretTuff: false && undefinedName short-circuits and returns Ok(0)", () => {
  expect(interpretTuff("false && undefinedName")).toEqual(ok(0));
});

test("interpretTuff: 1 && true is a TypeMismatch at the && operator", () => {
  expectWhere("1 && true", "TypeMismatch", "&&", 1);
});

test("interpretTuff: !1 is a TypeMismatch at the ! operator", () => {
  expectWhere("!1", "TypeMismatch", "!", 0);
});

test("interpretTuff: 1 == 1 && 2 < 3 returns Ok(1)", () => {
  expect(interpretTuff("1 == 1 && 2 < 3")).toEqual(ok(1));
});

test("interpretTuff: a block with logical operators returns Ok(1)", () => {
  expect(interpretTuff("{ let x = true; !x || x }")).toEqual(ok(1));
});

test("interpretTuff: !!true nests and returns Ok(1)", () => {
  expect(interpretTuff("!!true")).toEqual(ok(1));
});

test("interpretTuff: the else branch stops before && and is a TypeMismatch", () => {
  expectErrorKind("if (true) 1 else 2 && true", "TypeMismatch");
});

test("interpretTuff: 5000 nested ! returns NestingTooDeep", () => {
  expectErrorKind("!".repeat(5000) + "true", "NestingTooDeep");
});

test("interpretTuff: 1001 nested else-if returns NestingTooDeep", () => {
  expectErrorKind("if (false) 1 else ".repeat(1001) + "2", "NestingTooDeep");
});

test("interpretTuff: else-if still works and returns Ok(2)", () => {
  expect(interpretTuff("if (false) 1 else if (true) 2 else 3")).toEqual(ok(2));
});

test("interpretTuff: 'a' returns its ASCII value 97", () => {
  expect(interpretTuff("'a'")).toEqual(ok(97));
});

test("interpretTuff: 'a' == 'a' returns Ok(1)", () => {
  expect(interpretTuff("'a' == 'a'")).toEqual(ok(1));
});

test("interpretTuff: 'a' < 'b' is a TypeMismatch error", () => {
  expectErrorKind("'a' < 'b'", "TypeMismatch");
});

test("interpretTuff: 'ab' is an InvalidTerm error", () => {
  expectErrorKind("'ab'", "InvalidTerm");
});

test("interpretTuff: an unknown escape '\\q' is an InvalidTerm error", () => {
  expectErrorKind("'\\q'", "InvalidTerm");
});

test("interpretTuff: an escaped quote with no closer reports the missing closing quote", () => {
  const result = interpretTuff("'\\");

  expect(!result.ok && result.error.kind).toBe("InvalidTerm");
  expect(!result.ok && result.error.why.includes("closing")).toBe(true);
});

test("interpretTuff: an unclosed string 'a reports the missing closing quote", () => {
  const result = interpretTuff("'a");

  expect(!result.ok && result.error.why.includes("closing")).toBe(true);
});

test("interpretTuff: a non-ASCII character is its code point: 'é' returns Ok(233)", () => {
  expect(interpretTuff("'é'")).toEqual(ok(233));
});

test("interpretTuff: 'a' + 1 is a TypeMismatch error", () => {
  expectErrorKind("'a' + 1", "TypeMismatch");
});

test("interpretTuff: an escaped backslash '\\\\' returns its code 92", () => {
  expect(interpretTuff("'\\\\'")).toEqual(ok(92));
});

test("interpretTuff: a string in a let binding compares equal", () => {
  expect(interpretTuff("let c = 'x'; c == 'x'")).toEqual(ok(1));
});

test("interpretTuff: let array = [1, 2, 3]; array[0] + array[1] + array[2] returns Ok(6)", () => {
  expect(interpretTuff("let array = [1, 2, 3]; array[0] + array[1] + array[2]")).toEqual(ok(6));
});

test("interpretTuff: an index past the end is an IndexOutOfRange error", () => {
  expectErrorKind("let mut a = [1, 2]; a[5]", "IndexOutOfRange");
});

test("interpretTuff: a negative index is an IndexOutOfRange error", () => {
  expectErrorKind("let mut a = [1, 2]; a[-1]", "IndexOutOfRange");
});

test("interpretTuff: a whole array used after a move is a UseAfterMove error", () => {
  expectErrorKind("let a = [1]; let b = a; a[0]", "UseAfterMove");
});

test("interpretTuff: an element assignment updates the element: 5 + 2 returns Ok(7)", () => {
  expect(interpretTuff("let mut a = [1, 2]; a[0] = 5; a[0] + a[1]")).toEqual(ok(7));
});

test("interpretTuff: an element of the wrong type is a TypeMismatch error", () => {
  expectErrorKind("let mut a = [1]; a[0] = true;", "TypeMismatch");
});

test("interpretTuff: mixed element types are a TypeMismatch error", () => {
  expectErrorKind("[1, true]", "TypeMismatch");
});

test("interpretTuff: nested indexing grid[1][0] returns Ok(3)", () => {
  expect(interpretTuff("let grid = [[1, 2], [3, 4]]; grid[1][0]")).toEqual(ok(3));
});

test("interpretTuff: reassigning a number array to a string array is a TypeMismatch error", () => {
  expectErrorKind("let mut a = [1]; a = ['x']; 0", "TypeMismatch");
});

test("interpretTuff: a nested array of mixed element types is a TypeMismatch error", () => {
  expectErrorKind("let g = [[1], ['a']]; 0", "TypeMismatch");
});

test("interpretTuff: replacing a nested array with another of the same type returns Ok(2)", () => {
  expect(interpretTuff("let mut g = [[1]]; g[0] = [2]; g[0][0]")).toEqual(ok(2));
});

test("interpretTuff: an empty array literal is an EmptyArrayLiteral error", () => {
  expectErrorKind("[]", "EmptyArrayLiteral");
});

test("interpretTuff: using a whole array after it was moved is a UseAfterMove error", () => {
  expectErrorKind("let a = [1]; let b = a; a[0]", "UseAfterMove");
});

test("interpretTuff: indexing an array does not move it: Ok(1)", () => {
  expect(interpretTuff("let a = [1]; let b = a[0]; a[0]")).toEqual(ok(1));
});

test("interpretTuff: let x = 1; let y = &x; *y returns Ok(1)", () => {
  expect(interpretTuff("let x = 1; let y = &x; *y")).toEqual(ok(1));
});

test("interpretTuff: writing through &mut changes the borrowed name: Ok(2)", () => {
  expect(interpretTuff("let mut x = 1; let y = &mut x; *y = 2; x")).toEqual(ok(2));
});

test("interpretTuff: writing through a read-only reference is an ImmutableAssignment error", () => {
  expectErrorKind("let x = 1; let y = &x; *y = 2; x", "ImmutableAssignment");
});

test("interpretTuff: a program that is a reference is a TypeMismatch error", () => {
  expectErrorKind("let x = 1; &x", "TypeMismatch");
});

test("interpretTuff: a reference that outlives its block is a ReferenceEscapes error", () => {
  expectErrorKind("let y = { let x = 1; &x }; 0", "ReferenceEscapes");
});

test("interpretTuff: an outer reference reassigned to an inner name is a ReferenceEscapes error", () => {
  expectErrorKind("let mut x = 1; let mut h = &x; let u = { let y = 2; h = &y; 0 }; *h", "ReferenceEscapes");
});

test("interpretTuff: an array holding an inner reference is a ReferenceEscapes error", () => {
  expectErrorKind("let mut x = 1; let mut a = [&x]; let u = { let y = 2; a = [&y]; 0 }; *a[0]", "ReferenceEscapes");
});

test("interpretTuff: a block-local reference stored in a block-local holder stays valid: Ok(1)", () => {
  expect(interpretTuff("let mut x = 1; let mut h = &x; let u = { let mut y = 2; let k = &mut y; h = &x; 0 }; *h")).toEqual(ok(1));
});

test("interpretTuff: 7 / 2 truncates toward zero and returns Ok(3)", () => {
  expect(interpretTuff("7 / 2")).toEqual(ok(3));
});

test("interpretTuff: -7 / 2 truncates toward zero and returns Ok(-3)", () => {
  expect(interpretTuff("-7 / 2")).toEqual(ok(-3));
});

test("interpretTuff: 1 / 0 is a DivisionByZero error", () => {
  expectErrorKind("1 / 0", "DivisionByZero");
});

test("interpretTuff: 8 / 2 * 2 evaluates left to right and returns Ok(8)", () => {
  expect(interpretTuff("8 / 2 * 2")).toEqual(ok(8));
});

test("interpretTuff: 1 | 2 returns Ok(3)", () => {
  expect(interpretTuff("1 | 2")).toEqual(ok(3));
});

test("interpretTuff: 3 & 5 returns Ok(1)", () => {
  expect(interpretTuff("3 & 5")).toEqual(ok(1));
});

test("interpretTuff: 1 << 3 returns Ok(8)", () => {
  expect(interpretTuff("1 << 3")).toEqual(ok(8));
});

test("interpretTuff: 16 >> 2 returns Ok(4)", () => {
  expect(interpretTuff("16 >> 2")).toEqual(ok(4));
});

test("interpretTuff: a shift by 32 is a BitwiseOutOfRange error", () => {
  expectErrorKind("1 << 32", "BitwiseOutOfRange");
});

test("interpretTuff: an operand outside 32 bits is a BitwiseOutOfRange error", () => {
  expectErrorKind("3000000000 | 1", "BitwiseOutOfRange");
});

test("interpretTuff: a block-branch if followed by | is an InvalidTerm error", () => {
  expectErrorKind("{ let mut x = 0; if (true) { x = 1; } else { x = 2; } | 2 }", "InvalidTerm");
});

test("interpretTuff: { if (true) { 1 } else { 2 } | 2 } returns Ok(3)", () => {
  expect(interpretTuff("{ if (true) { 1 } else { 2 } | 2 }")).toEqual(ok(3));
});

test("interpretTuff: if (false) 1 else 2 | 4 returns Ok(6)", () => {
  expect(interpretTuff("if (false) 1 else 2 | 4")).toEqual(ok(6));
});

test("interpretTuff: if (false) 1 else 2 << 1 returns Ok(4)", () => {
  expect(interpretTuff("if (false) 1 else 2 << 1")).toEqual(ok(4));
});

test("interpretTuff: -1 >> 31 returns Ok(-1) and -8 >> 1 returns Ok(-4)", () => {
  expect(interpretTuff("-1 >> 31")).toEqual(ok(-1));
  expect(interpretTuff("-8 >> 1")).toEqual(ok(-4));
});

test("interpretTuff: 1 << 31 returns Ok(-2147483648)", () => {
  expect(interpretTuff("1 << 31")).toEqual(ok(-2147483648));
});

test("interpretTuff: -1 & 0 returns positive zero", () => {
  const result = interpretTuff("-1 & 0");

  expect(result.ok).toBe(true);
  expect(Object.is(result.ok ? result.value : undefined, 0)).toBe(true);
});

test("interpretTuff: \"100U64\" => 100", () => {
  expect(interpretTuff("100U64")).toEqual(ok(100));
});

test("interpretTuff: 1U64 + 1 is a TypeMismatch error", () => {
  expectErrorKind("1U64 + 1", "TypeMismatch");
});

test("interpretTuff: 0U64 - 1U64 is a U64OutOfRange error", () => {
  expectErrorKind("0U64 - 1U64", "U64OutOfRange");
});

test("interpretTuff: 18446744073709551616U64 is a U64OutOfRange error", () => {
  expectErrorKind("18446744073709551616U64", "U64OutOfRange");
});

test("interpretTuff: 18446744073709551615U64 & 1U64 returns Ok(1)", () => {
  expect(interpretTuff("18446744073709551615U64 & 1U64")).toEqual(ok(1));
});

test("interpretTuff: 2U64 / 0U64 is a DivisionByZero error that says U64, not number", () => {
  const result = interpretTuff("2U64 / 0U64");

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.kind).toBe("DivisionByZero");
    expect(result.error.why).not.toContain("number");
  }
});

test("interpretTuff: 9007199254740993U64 is a ResultTooLarge error that describes the program result", () => {
  const result = interpretTuff("9007199254740993U64");

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.kind).toBe("ResultTooLarge");
    expect(result.error.why).not.toContain("running value");
  }
});

test("interpretTuff: 9007199254740992U64 - 1U64 returns Ok(9007199254740991)", () => {
  expect(interpretTuff("9007199254740992U64 - 1U64")).toEqual(ok(9007199254740991));
});

test("interpretTuff: 9007199254740991U64 + 1U64 is a ResultTooLarge error", () => {
  expectErrorKind("9007199254740991U64 + 1U64", "ResultTooLarge");
});

test("interpretTuff: 18446744073709551615U64 + 1U64 is a U64OutOfRange error", () => {
  expectErrorKind("18446744073709551615U64 + 1U64", "U64OutOfRange");
});

test("interpretTuff: 1U64 << 31U64 returns Ok(2147483648)", () => {
  expect(interpretTuff("1U64 << 31U64")).toEqual(ok(2147483648));
});

test("interpretTuff: 1U64 << 32U64 is a BitwiseOutOfRange error", () => {
  expectErrorKind("1U64 << 32U64", "BitwiseOutOfRange");
});

test("interpretTuff: -1U64 is a TypeMismatch error", () => {
  expectErrorKind("-1U64", "TypeMismatch");
});

test("interpretTuff: 1U64 == 1 is a TypeMismatch error", () => {
  expectErrorKind("1U64 == 1", "TypeMismatch");
});

test("interpretTuff: 1U64 & 3U64 | 4U64 returns Ok(5)", () => {
  expect(interpretTuff("1U64 & 3U64 | 4U64")).toEqual(ok(5));
});

test("interpretTuff: the maximum literal of each sized type returns its value", () => {
  const cases: [string, number][] = [
    ["255U8", 255],
    ["65535U16", 65535],
    ["4294967295U32", 4294967295],
    ["127I8", 127],
    ["32767I16", 32767],
    ["2147483647I32", 2147483647],
    ["9007199254740991I64", 9007199254740991],
  ];

  cases.forEach(([source, value]) => {
    expect(interpretTuff(source)).toEqual(ok(value));
  });
});

test("interpretTuff: one above the maximum of each sized type is an IntegerOutOfRange error", () => {
  ["256U8", "65536U16", "4294967296U32", "128I8", "32768I16", "2147483648I32"].forEach((source) => {
    expectErrorKind(source, "IntegerOutOfRange");
  });
});

test("interpretTuff: 200U8 + 100U8 is an IntegerOutOfRange error", () => {
  expectErrorKind("200U8 + 100U8", "IntegerOutOfRange");
});

test("interpretTuff: -128I8 returns Ok(-128) and -(-128I8) is an IntegerOutOfRange error", () => {
  expect(interpretTuff("-128I8")).toEqual(ok(-128));
  expectErrorKind("-(-128I8)", "IntegerOutOfRange");
});

test("interpretTuff: -1U8 is a TypeMismatch error", () => {
  expectErrorKind("-1U8", "TypeMismatch");
});

test("interpretTuff: 1U8 + 1U16 is a TypeMismatch error", () => {
  expectErrorKind("1U8 + 1U16", "TypeMismatch");
});

test("interpretTuff: -1I8 & 3I8 returns Ok(3) and 1I8 << 7I8 is an IntegerOutOfRange error", () => {
  expect(interpretTuff("-1I8 & 3I8")).toEqual(ok(3));
  expectErrorKind("1I8 << 7I8", "IntegerOutOfRange");
});

test("interpretTuff: 0I8 - 1I8 returns Ok(-1)", () => {
  expect(interpretTuff("0I8 - 1I8")).toEqual(ok(-1));
});

test("interpretTuff: 9007199254740991I64 + 1I64 is a ResultTooLarge error", () => {
  expectErrorKind("9007199254740991I64 + 1I64", "ResultTooLarge");
});

test("interpretTuff: 4I8 >> -1I8 is a BitwiseOutOfRange error at >> that names -1", () => {
  const result = interpretTuff("4I8 >> -1I8");

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.kind).toBe("BitwiseOutOfRange");
    expect(result.error.where.text).toBe(">>");
    expect(result.error.why).toContain("-1");
  }
});

test("interpretTuff: 1I8 << -1I8 is a BitwiseOutOfRange error", () => {
  expectErrorKind("1I8 << -1I8", "BitwiseOutOfRange");
});

test("interpretTuff: \"let x : U8 = 100U8; x\" => 100", () => {
  expect(interpretTuff("let x : U8 = 100U8; x")).toEqual(ok(100));
});

test("interpretTuff: \"let x : Bool =  true; x\" => 1", () => {
  expect(interpretTuff("let x : Bool =  true; x")).toEqual(ok(1));
});

test("interpretTuff: let x : Bool = 1; x is a TypeMismatch error", () => {
  expectErrorKind("let x : Bool = 1; x", "TypeMismatch");
});

test("interpretTuff: a Bool annotation keeps its type on reassignment", () => {
  expectErrorKind("let mut x : Bool = true; x = 1; x", "TypeMismatch");
  expect(interpretTuff("let mut x : Bool = true; x = false; x")).toEqual(ok(0));
});

test("interpretTuff: a lowercase bool is not a type name, and a bracketed value is not a Bool", () => {
  expectErrorKind("let x : bool = true; x", "InvalidTerm");
  expectErrorKind("let x : Bool = [true]; x", "TypeMismatch");
});

test("interpretTuff: let x : Bool = 1 == 1; x returns Ok(1)", () => {
  expect(interpretTuff("let x : Bool = 1 == 1; x")).toEqual(ok(1));
});

test("interpretTuff: let x : U8 = 100; x is a TypeMismatch error", () => {
  expectErrorKind("let x : U8 = 100; x", "TypeMismatch");
});

test("interpretTuff: let x : I8 = 1I8; x returns Ok(1)", () => {
  expect(interpretTuff("let x : I8 = 1I8; x")).toEqual(ok(1));
});

test("interpretTuff: let x : I8 = 1U8; x is a TypeMismatch error", () => {
  expectErrorKind("let x : I8 = 1U8; x", "TypeMismatch");
});

test("interpretTuff: let x : U8 = 1U8 == 1U8; x is a TypeMismatch error", () => {
  expectErrorKind("let x : U8 = 1U8 == 1U8; x", "TypeMismatch");
});

test("interpretTuff: let x : U8 = 300U8; x is an IntegerOutOfRange error", () => {
  expectErrorKind("let x : U8 = 300U8; x", "IntegerOutOfRange");
});

test("interpretTuff: let x : Foo = 1; x is an InvalidTerm error", () => {
  expectErrorKind("let x : Foo = 1; x", "InvalidTerm");
});

test("interpretTuff: \"let mut x = 0; while (x < 4) { x += 1; } x\" => 4", () => {
  expect(interpretTuff("let mut x = 0; while (x < 4) { x += 1; } x")).toEqual(ok(4));
});

test("interpretTuff: \"let mut x = 0; while (x < 4) x += 1; x\" => 4", () => {
  expect(interpretTuff("let mut x = 0; while (x < 4) x += 1; x")).toEqual(ok(4));
});

test("interpretTuff: \"let mut x = 0; if (x < 4) x += 1; x\" => 1", () => {
  expect(interpretTuff("let mut x = 0; if (x < 4) x += 1; x")).toEqual(ok(1));
});

test("interpretTuff: an if may mix a braced then branch with an unbraced else branch", () => {
  expect(interpretTuff("let mut x = 0; if (true) { x += 1; } else x += 2; x")).toEqual(ok(1));
  expect(interpretTuff("let mut x = 0; if (false) { x += 1; } else x += 2; x")).toEqual(ok(2));
});

test("interpretTuff: an if may be the unbraced branch of another if, and the else binds to the inner if", () => {
  expect(interpretTuff("let mut x = 0; if (true) if (true) x += 1; x")).toEqual(ok(1));
  expect(interpretTuff("let mut x = 0; if (true) if (false) x += 1; else x += 2; x")).toEqual(ok(2));
});

test("interpretTuff: a let as an unbraced if body is an InvalidTerm error that names the rule", () => {
  const result = interpretTuff("let mut x = 0; if (x < 4) let y = 1; x");

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.kind).toBe("InvalidTerm");
    expect(result.error.why).toContain("a statement other than let");
  }
});

test("interpretTuff: unbraced if branches choose one statement each", () => {
  expect(interpretTuff("let mut x = 5; if (x < 4) x += 1; else x += 2; x")).toEqual(ok(7));
});

test("interpretTuff: nested while loops run to completion", () => {
  expect(interpretTuff("let mut x = 0; while (x < 2) while (x < 2) x += 1; x")).toEqual(ok(2));
  expect(interpretTuff("let mut x = 0; while (x < 3) { while (x < 2) { x += 1; } x += 1; } x")).toEqual(ok(3));
});

test("interpretTuff: a U8 loop stops at its bound, and a compound assignment past the range is IntegerOutOfRange", () => {
  expect(interpretTuff("let mut x : U8 = 250U8; while (x < 255U8) { x += 1U8; } x")).toEqual(ok(255));
  expectErrorKind("let mut x : U8 = 0U8; x += 300U8; x", "IntegerOutOfRange");
});

test("interpretTuff: a let inside a braced loop body is scoped to each pass, and a missing ';' before '}' is an InvalidTerm error", () => {
  expect(interpretTuff("let mut x = 0; while (x < 3) { let y = 1; x += y; } x")).toEqual(ok(3));
  expectErrorKind("let mut x = 0; while (x < 2) { x += 1 } x", "InvalidTerm");
});

test("interpretTuff: an unbraced while body that is a let is an InvalidTerm error", () => {
  expectErrorKind("let mut x = 0; while (x < 2) let y = 1; x", "InvalidTerm");
});

test("interpretTuff: a while loop whose condition is false runs zero times", () => {
  expect(interpretTuff("let mut x = 0; while (false) { x += 1; } x")).toEqual(ok(0));
});

test("interpretTuff: while (1) { } is a TypeMismatch error", () => {
  expectErrorKind("while (1) { } 0", "TypeMismatch");
});

test("interpretTuff: x /= 0 is a DivisionByZero error", () => {
  expectErrorKind("let mut x = 5; x /= 0; x", "DivisionByZero");
});

test("interpretTuff: 4I8 >> 0I8 returns Ok(4)", () => {
  expect(interpretTuff("4I8 >> 0I8")).toEqual(ok(4));
});

test("interpretTuff: 1I32 << 32I32 is a BitwiseOutOfRange error", () => {
  expectErrorKind("1I32 << 32I32", "BitwiseOutOfRange");
});

test("interpretTuff: 1 == true is a TypeMismatch error", () => {
  expectErrorKind("1 == true", "TypeMismatch");
});

test("interpretTuff: 1 < 2 < 3 is an InvalidTerm error", () => {
  expectErrorKind("1 < 2 < 3", "InvalidTerm");
});

test("interpretTuff('true') returns Ok(1)", () => {
  expect(interpretTuff("true")).toEqual(ok(1));
});

test("interpretTuff('true + 1') is a TypeMismatch error", () => {
  expectErrorKind("true + 1", "TypeMismatch");
});

test("interpretTuff('') is an error, not 0", () => {
  expect(interpretTuff("").ok).toBe(false);
});

test("interpretTuff('   ') is an error, not 0", () => {
  expect(interpretTuff("   ").ok).toBe(false);
});

test("interpretTuff('abc') is an error, not NaN", () => {
  expect(interpretTuff("abc").ok).toBe(false);
});

test("interpretTuff('0x1F') is an error", () => {
  expect(interpretTuff("0x1F").ok).toBe(false);
});
