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
