import { test, expect } from "@jest/globals";
import { compileTuffToJS } from "../src/lib.js";

function expectValid(source, stdIn, expectedExitCode) {
  const result = compileTuffToJS(source);
  if (result.variant === "err") throw new Error(result.error);
  const actualExitCode = new Function("stdIn", result.value)(stdIn);
  expect(expectedExitCode).toBe(actualExitCode);
}

function expectInvalid(source) {
  expect(compileTuffToJS(source).variant).toBe("err");
}

test("empty source compiles and exits with code 0", () => {
  expectValid("", "", 0);
});

test("read() returns parsed stdin as exit code", () => {
  expectValid("read()", "100", 100);
});

test("read() parses first token from multi-token stdin", () => {
  expectValid("read()", "100 20", 100);
});

test("multiple read() calls consume tokens sequentially, last value wins", () => {
  expectValid("read(); read()", "100 20", 20);
});

test("let variable assignment with expression return", () => {
  expectValid("let x = read(); x", "100 20", 100);
});

test("expression with two reads sums the values", () => {
  expectValid("read() + read()", "100 20", 120);
});

test("extern type declaration compiles and exits with code 0", () => {
  expectValid("extern type Foo;", "", 0);
});

test("extern let declaration compiles and exits with code 0", () => {
  expectValid("extern let fs : FileSystem = extern fs;", "", 0);
});

test("extern fn declaration compiles and exits with code 0", () => {
  expectValid("extern fn doNothing() : Void;", "", 0);
});

test("struct Empty {} compiles and exits with code 0", () => {
  expectValid("struct Empty {}", "", 0);
});

test("struct Empty<T> {} compiles and exits with code 0", () => {
  expectValid("struct Empty<T> {}", "", 0);
});

test("struct Wrapper<T> { field : T } compiles and exits with code 0", () => {
  expectValid("struct Wrapper<T> { field : T }", "", 0);
});

test("struct instantiation with fields, dot access returns field value", () => {
  expectValid(
    "struct Wrapper { x : I32} let temp : Wrapper = Wrapper { x : 100 }; temp.x",
    "",
    100,
  );
});

test("struct Two<T> { a : T, b : T } compiles and exits with code 0", () => {
  expectValid("struct Two<T> { a : T, b : T }", "", 0);
});

test("multiple struct declarations compile and exit with code 0", () => {
  expectValid("struct A {} struct B {}", "", 0);
});

test("type alias compiles and exits with code 0", () => {
  expectValid("type Temp = I32;", "", 0);
});

test("struct + type alias referencing struct compiles and exits with code 0", () => {
  expectValid("struct A {} type Temp = A;", "", 0);
});

test("type alias with union of structs compiles and exits with code 0", () => {
  expectValid("struct A {} struct B {} type Temp = A | B;", "", 0);
});

test("type alias with slice referencing struct compiles and exits with code 0", () => {
  expectValid("struct A {} type ASlice = *[A];", "", 0);
});

test("string literal .length returns character count", () => {
  expectValid('"test".length', "", 4);
});

test("typed let with string variable, .length on identifier returns length", () => {
  expectValid('type Str = *[U8]; let x : Str = "test"; x.length', "", 4);
});

test("string literal as argument to call expression, .length on parameter returns length", () => {
  expectValid('fn len(s : *[U8]) => s.length; len("hello")', "", 5);
});

test("function declaration and call returns expression value", () => {
  expectValid("fn get() => 100; get()", "", 100);
});

test("block comment is ignored, empty program exits with code 0", () => {
  expectValid("/* let x = 100; x */", "", 0);
});

test("function declaration with return type annotation compiles and calls correctly", () => {
  expectValid("fn get() : I32 => 100; get()", "", 100);
});

test("struct declaration with typed let and empty object literal compiles to 0", () => {
  expectValid("struct Empty {} let empty : Empty = {};", "", 0);
});

test("function with block body, generic return type, and struct instantiation returns 0", () => {
  expectValid(
    "struct Empty<T> {} fn get() : Empty<I32> => { return {}; }",
    "",
    0,
  );
});
test("type alias with generic parameters compiles and exits with code 0", () => {
  expectValid("struct A<K> {} type Temp<U> = A<U>;", "", 0);
});
test("mutable variable assignment via this.x returns new value", () => {
  expectValid("let mut x = 0; this.x = 100; x", "", 100);
});

test("this assigned to variable, dot access on variable returns mutable field value", () => {
  expectValid("let mut x = 100; let temp = this; temp.x", "", 100);
});

test("assignment through snapshot of this does not affect original context", () => {
  expectValid("let mut x = 100; let mut temp = this; temp.x = 200; x", "", 100);
});

test("struct method with receiver parameter and method call syntax returns sum of fields", () => {
  expectValid(
    "struct Point { x : I32, y : I32 } fn manhattan(this : Point) => this.x + this.y; let point = Point { x : 3, y : 4 }; point.manhattan()",
    "",
    7,
  );
});

test("unknown identifier is rejected", () => {
  expectInvalid("foo");
});
