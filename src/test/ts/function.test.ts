import { test } from "bun:test";
import {
  expectValid,
  expectInvalid,
  expectValidWithModules,
} from "./test-helpers";

// === BASIC FUNCTION DEFINITION AND CALL ===

test("simple function definition and call", () => {
  expectValid(
    "fn add(a : I32, b : I32) : I32 => a + b; add(1I32, 2I32)",
    [],
    3,
  );
});

test("function with no parameters", () => {
  expectValid("fn get_zero() : I32 => 0; get_zero()", [], 0);
});

test("function with single parameter", () => {
  expectValid("fn double(x : I32) : I32 => x * 2I32; double(21I32)", [], 42);
});

test("function call as exit expression", () => {
  expectValid("fn forty_two() : I32 => 42I32; forty_two()", [], 42);
});

test("function with block body", () => {
  expectValid("fn get() : I32 => { let x : I32 = 100I32; x }; get()", [], 100);
});

test("function with multiple statements in body", () => {
  expectValid(
    "fn compute() : I32 => { let x : I32 = 10I32; let y : I32 = 2I32; x * y }; compute()",
    [],
    20,
  );
});

test("function calling another function", () => {
  expectValid(
    "fn inc(x : I32) : I32 => x + 1I32; fn double(x : I32) : I32 => inc(x) + inc(x); double(20I32)",
    [],
    42,
  );
});

test("nested function calls", () => {
  expectValid(
    "fn add(a : I32, b : I32) : I32 => a + b; add(add(1I32, 2I32), 3I32)",
    [],
    6,
  );
});

test("function with unused parameter", () => {
  expectValid("fn ignore(x : I32) : I32 => 42I32; ignore(0I32)", [], 42);
});

test("function returning struct field access", () => {
  expectValid(
    "struct Point { x : I32 }; fn get_x(p : Point) : I32 => p.x; let p : Point = Point { x: 42I32 }; get_x(p)",
    [],
    42,
  );
});

// === ARITHMETIC OPERATORS ===

test("addition operator", () => {
  expectValid("10I32 + 32I32", [], 42);
});

test("subtraction operator", () => {
  expectValid(
    "fn sub(a : I32, b : I32) : I32 => a - b; sub(50I32, 8I32)",
    [],
    42,
  );
});

test("multiplication operator", () => {
  expectValid(
    "fn mul(a : I32, b : I32) : I32 => a * b; mul(6I32, 7I32)",
    [],
    42,
  );
});

test("division operator", () => {
  expectValid(
    "fn div(a : I32, b : I32) : I32 => a / b; div(84I32, 2I32)",
    [],
    42,
  );
});

test("modulo operator", () => {
  expectValid(
    "fn mod(a : I32, b : I32) : I32 => a % b; mod(100I32, 58I32)",
    [],
    42,
  );
});

test("chained arithmetic", () => {
  expectValid("10I32 + 20I32 + 12I32", [], 42);
});

test("arithmetic with variables", () => {
  expectValid("let x : I32 = 10I32; let y : I32 = 32I32; x + y", [], 42);
});

// === OPERATOR PRECEDENCE ===

test("multiplication before addition", () => {
  expectValid("1I32 + 2I32 * 3I32", [], 7);
});

test("parentheses override precedence", () => {
  expectValid("(1I32 + 2I32) * 3I32", [], 9);
});

test("division same precedence as multiplication", () => {
  expectValid("100I32 / 10I32 + 32I32", [], 42);
});

// === GENERIC FUNCTIONS ===

test("generic function with explicit type arg", () => {
  expectValid("fn identity<T>(x : T) : T => x; identity<I32>(42I32)", [], 42);
});

test("generic function with U8 type arg", () => {
  expectValid("fn identity<T>(x : T) : T => x; identity<U8>(42U8)", [], 42);
});

test("generic function with two type params", () => {
  expectValid(
    "fn first<T, U>(a : T, b : U) : T => a; first<I32, U8>(42I32, 0U8)",
    [],
    42,
  );
});

test("generic function with struct type arg", () => {
  expectValid(
    "struct Point { x : I32 }; fn get_x<P>(p : P) : I32 => p.x; let p : Point = Point { x: 42I32 }; get_x<Point>(p)",
    [],
    42,
  );
});

// === OUT FN (MODULE EXPORTS) ===

test("out fn in non-module mode is a no-op", () => {
  expectValid(
    "out fn add(a : I32, b : I32) : I32 => a + b; add(10I32, 32I32)",
    [],
    42,
  );
});

test("out fn in module mode", () => {
  expectValidWithModules(
    ["index"],
    {
      ["index"]: "lib.add(10I32, 32I32)",
      ["lib"]: "out fn add(a : I32, b : I32) : I32 => a + b;",
    },
    [],
    42,
  );
});

test("out fn with nested module path", () => {
  expectValidWithModules(
    ["index"],
    {
      ["index"]: "lib.math.add(10I32, 32I32)",
      ["lib.math"]: "out fn add(a : I32, b : I32) : I32 => a + b;",
    },
    [],
    42,
  );
});

test("out generic fn in module mode", () => {
  expectValidWithModules(
    ["index"],
    {
      ["index"]: "lib.identity<I32>(42I32)",
      ["lib"]: "out fn identity<T>(x : T) : T => x;",
    },
    [],
    42,
  );
});

// === NEGATIVE TESTS ===

test("calling undefined function is invalid", () => {
  expectInvalid("undefined_fn(42I32)");
});

test("wrong arg count: too few", () => {
  expectInvalid("fn add(a : I32, b : I32) : I32 => a + b; add(1I32)");
});

test("wrong arg count: too many", () => {
  expectInvalid(
    "fn add(a : I32, b : I32) : I32 => a + b; add(1I32, 2I32, 3I32)",
  );
});

test("wrong arg type", () => {
  expectInvalid("fn add(a : I32, b : I32) : I32 => a + b; add(1I32, 2U8)");
});

test("arithmetic on mismatched types is invalid", () => {
  expectInvalid("10I32 + 20U8");
});

test("arithmetic on non-numeric types is invalid", () => {
  expectInvalid("struct S { x : I32 }; let s : S = S { x: 1I32 }; s + 1I32");
});

test("function missing return type is invalid", () => {
  expectInvalid("fn add(a : I32) => a + 1I32;");
});

test("function parameter missing type is invalid", () => {
  expectInvalid("fn add(a, b : I32) : I32 => a + b;");
});

test("generic function with wrong type arg", () => {
  expectInvalid("fn identity<T>(x : T) : T => x; identity<InvalidType>(42I32)");
});

test("division by zero is invalid", () => {
  expectInvalid("10I32 / 0I32");
});

test("function call with no args when params expected", () => {
  expectInvalid("fn add(a : I32, b : I32) : I32 => a + b; add()");
});

test("arithmetic with bool is invalid", () => {
  expectInvalid("true + false");
});

test("modulo by zero is invalid", () => {
  expectInvalid("10I32 % 0I32");
});

// === EDGE CASES ===

test("function with U64 arithmetic", () => {
  expectValid(
    "fn add(a : U64, b : U64) : U64 => a + b; add(20U64, 22U64)",
    [],
    42,
  );
});

test("function with I64 arithmetic", () => {
  expectValid(
    "fn sub(a : I64, b : I64) : I64 => a - b; sub(100I64, 58I64)",
    [],
    42,
  );
});

test("function body with let and arithmetic", () => {
  expectValid(
    "fn compute(a : I32, b : I32) : I32 => { let c = a * b; c + 12I32 }; compute(3I32, 10I32)",
    [],
    42,
  );
});

test("function returning literal", () => {
  expectValid("fn forty_two() : I32 => 42I32; forty_two()", [], 42);
});

test("function with zero return", () => {
  expectValid("fn zero() : I32 => 0I32; zero()", [], 0);
});

test("function call result stored in variable", () => {
  expectValid(
    "fn add(a : I32, b : I32) : I32 => a + b; let x = add(10I32, 32I32); x",
    [],
    42,
  );
});

test("function used in arithmetic expression", () => {
  expectValid("fn get_ten() : I32 => 10I32; get_ten() + 32I32", [], 42);
});

test("function returning function call result", () => {
  expectValid(
    "fn get_one() : I32 => 1I32; fn inc(x : I32) : I32 => x + 1I32; inc(get_one())",
    [],
    2,
  );
});
