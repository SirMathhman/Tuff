import { test, expect } from "@jest/globals";
import { compileTuffToJS } from "../../main/js/lib.js";

function expectValid(source, stdIn, expectedExitCode) {
  const result = compileTuffToJS(source);
  if (result.variant === "err") throw new Error(result.error);
  try {
    const actualExitCode = new Function("stdIn", result.value)(stdIn);
    expect(expectedExitCode).toBe(actualExitCode);
  } catch (e) {
    throw new Error("Generated: '" + result.value + "'", e);
  }
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

test("out fn exports function that can be called and returns result", () => {
  expectValid("out fn double(n : I32) => n * 2; let x = double(21); x", "", 42);
});

test("unknown identifier is rejected", () => {
  expectInvalid("foo");
});

import {
  compileModulesToJS,
  compileModulesWithNative,
} from "../../main/js/lib.js";

function expectValidWithModules(
  moduleNames,
  moduleSources,
  stdIn,
  expectedExitCode,
) {
  const result = compileModulesToJS(moduleNames, moduleSources);
  if (result.variant === "err") throw new Error(result.error);
  try {
    const actualExitCode = new Function("stdIn", result.value)(stdIn);
    expect(expectedExitCode).toBe(actualExitCode);
  } catch (e) {
    throw new Error("Generated: '" + result.value + "'", e);
  }
}

test("multi-module compilation returns value from single module", () => {
  expectValidWithModules(["index"], { index: "1" }, "", 1);
});

test("cross-module export access via lib.x returns exported value", () => {
  expectValidWithModules(
    ["index", "lib"],
    { index: "lib.x", lib: "out let x = 1;" },
    "",
    1,
  );
});

test("cross-module export access via variable assignment returns exported value with implicit dependency", () => {
  expectValidWithModules(
    ["index"],
    { index: "let temp = lib; temp.x", lib: "out let x = 1;" },
    "",
    1,
  );
});

test("destructuring imports from module exports returns extracted value", () => {
  expectValidWithModules(
    ["index"],
    { index: "let { x } = lib; x", lib: "out let x = 1;" },
    "",
    1,
  );
});

test("exported function via out fn can be called from another module", () => {
  expectValidWithModules(
    ["index", "math"],
    {
      index: "let result = math::double(21); result",
      math: "out fn double(n : I32) => n * 2;",
    },
    "",
    42,
  );
});

function expectValidWithNativeModules(
  tuffModuleNames,
  tuffSources,
  nativeModules,
  stdIn,
  expectedExitCode,
) {
  const result = compileModulesWithNative(
    tuffModuleNames,
    tuffSources,
    nativeModules,
  );
  if (result.variant === "err") throw new Error(result.error);
  try {
    const actualExitCode = new Function("stdIn", result.value)(stdIn);
    expect(expectedExitCode).toBe(actualExitCode);
  } catch (e) {
    throw new Error("Generated: '" + result.value + "'", e);
  }
}

test("native module import via extern let destructuring returns exported value", () => {
  expectValidWithNativeModules(
    ["index"],
    { index: "extern let { x } = extern lib; extern let x : I32; x" },
    { lib: "export const x = 1;" },
    "",
    1,
  );
});

test("native module extern fn invocation returns function result", () => {
  expectValidWithNativeModules(
    ["index"],
    {
      index:
        "extern let { add } = extern lib; extern fn add(first : I32, second : I32) : I32; add(3, 4)",
    },
    { lib: "export function add(first, second) { return first + second; }" },
    "",
    7,
  );
});

test("native module extern fn with receiver invokes method on struct instance", () => {
  expectValidWithNativeModules(
    ["index"],
    {
      index:
        "extern let { manhattan } = extern lib; struct Point { x : I32, y : I32 } extern fn manhattan(this : Point) : I32; let point = Point { x : 3, y : 4 }; point.manhattan()",
    },
    { lib: "export function manhattan(point) { return point.x + point.y; }" },
    "",
    7,
  );
});

/* Comparison operators */

test("less than comparison returns true", () => {
  expectValid("3 < 5", "", true);
});

test("less than comparison returns false", () => {
  expectValid("5 < 3", "", false);
});

test("greater than comparison returns true", () => {
  expectValid("5 > 3", "", true);
});

test("greater than comparison returns false", () => {
  expectValid("3 > 5", "", false);
});

test("less or equal comparison with smaller value", () => {
  expectValid("3 <= 5", "", true);
});

test("less or equal comparison with equal value", () => {
  expectValid("5 <= 5", "", true);
});

test("less or equal comparison returns false", () => {
  expectValid("6 <= 5", "", false);
});

test("greater or equal comparison with larger value", () => {
  expectValid("5 >= 3", "", true);
});

test("greater or equal comparison with equal value", () => {
  expectValid("5 >= 5", "", true);
});

test("greater or equal comparison returns false", () => {
  expectValid("4 >= 5", "", false);
});

test("equal comparison returns true", () => {
  expectValid("5 == 5", "", true);
});

test("equal comparison returns false", () => {
  expectValid("3 == 5", "", false);
});

test("not equal comparison returns true", () => {
  expectValid("3 != 5", "", true);
});

test("not equal comparison returns false", () => {
  expectValid("5 != 5", "", false);
});

test("comparison with variables works correctly", () => {
  expectValid("let a = 10; let b = 20; a < b", "", true);
});

test("comparison in arithmetic expression respects precedence", () => {
  // (3 + 2) < 10 → 5 < 10 → true
  expectValid("3 + 2 < 10", "", true);
});

/* If expressions */

test("if expression with true condition returns then-branch value", () => {
  expectValid("let x = if (true) 42 else 99; x", "", 42);
});

test("if expression with false condition returns else-branch value", () => {
  expectValid("let x = if (false) 42 else 99; x", "", 99);
});

test("if expression used directly as entry expression", () => {
  expectValid("if (true) 10 else 20", "", 10);
});

test("nested if-else chain works correctly", () => {
  expectValid("let x = if (false) 1 else if (true) 2 else 3; x", "", 2);
});

test("if expression with comparison in condition", () => {
  expectValid("let a = 5; let b = 10; if (a < b) 1 else 0", "", 1);
});

test("if expression returns correct value for false comparison", () => {
  expectValid("let a = 10; let b = 5; if (a < b) 1 else 0", "", 0);
});

/* Block expressions */

test("block expression with variable declaration and return value", () => {
  // let x = { let y = 42; y }; x → 42
  expectValid("let x = { let y = 42; y }; x", "", 42);
});

test("block expression evaluates last expression as result", () => {
  expectValid("{ let a = 10; let b = 20; a + b }", "", 30);
});

test("block expression with multiple statements and if inside", () => {
  expectValid("{ let x = 5; let y = 10; if (x < y) x else y }", "", 5);
});

// Compound assignment operators

test("+= compound assignment on mutable variable", () => {
  expectValid("let mut x = 10; x += 5; x", "", 15);
});

test("-= compound assignment on mutable variable", () => {
  expectValid("let mut x = 20; x -= 8; x", "", 12);
});

test("*= compound assignment on mutable variable", () => {
  expectValid("let mut x = 3; x *= 4; x", "", 12);
});

test("/= compound assignment on mutable variable", () => {
  expectValid("let mut x = 20; x /= 5; x", "", 4);
});

// Mutability checks for compound assignment
test("compound assignment rejected on immutable variable", () => {
  expectInvalid("let x = 10; x += 5;");
});

test("-= compound assignment rejected on immutable variable", () => {
  expectInvalid("let x = 20; x -= 8;");
});

// Compound assignment with dot access on mutable struct field
test("+= on mutable struct field via dot access", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let mut p = Point { x : 10, y : 20 }; p.x += 5; p.x",
    "",
    15,
  );
});

test("compound assignment on immutable struct field rejected", () => {
  expectInvalid(
    "struct Point { x : I32, y : I32 }; let p = Point { x : 10, y : 20 }; p.x += 5;",
  );
});
