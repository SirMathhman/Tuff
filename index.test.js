import { test, expect } from "bun:test";
import { evaluate } from ".";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate single number", () => {
  expect(evaluate("1")).toBe(1);
});

test("evaluate addition expression", () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test("evaluate chained addition", () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test("evaluate addition and subtraction", () => {
  expect(evaluate("3 + 4 - 5")).toBe(2);
});

test("evaluate multiplication and subtraction", () => {
  expect(evaluate("3 * 4 - 5")).toBe(7);
});

test("evaluate operator precedence", () => {
  expect(evaluate("3 + 4 * 5")).toBe(23);
});

test("evaluate parentheses", () => {
  expect(evaluate("(3 + 4) * 5")).toBe(35);
});

test("evaluate incomplete expression throws error", () => {
  expect(() => evaluate("1 + ")).toThrow();
});

test("evaluate unmatched parenthesis throws error", () => {
  expect(() => evaluate("(1 + 2")).toThrow();
});

test("evaluate curly braces grouping", () => {
  expect(evaluate("{ 3 + 4 } * 5")).toBe(35);
});

test("evaluate curly braces with let declaration", () => {
  expect(evaluate("{ let x = 3 + 4; x } * 5")).toBe(35);
});

test("evaluate top-level let with nested block", () => {
  expect(evaluate("let y = { let x = 3 + 4; x } * 5; y")).toBe(35);
});

test("evaluate let without assignment throws error", () => {
  expect(() => evaluate("let x;")).toThrow();
});

test("evaluate undefined identifier throws error", () => {
  expect(() => evaluate("undefinedIdentifier")).toThrow();
});

test("evaluate mutable variable assignment", () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test("evaluate assignment to immutable variable throws error", () => {
  expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
});

test("evaluate assignment to undefined variable throws error", () => {
  expect(() => evaluate("x = 1; x")).toThrow();
});

test("evaluate boolean true", () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test("evaluate or operator", () => {
  expect(evaluate("true || true")).toBe(1);
});

test("evaluate and operator", () => {
  expect(evaluate("true && false")).toBe(0);
});

test("evaluate variable redeclaration", () => {
  expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
});

test("evaluate mutable variable assignment in block", () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
});

test("evaluate block variable shadowing", () => {
  expect(evaluate("let x = 1; { let x = 0; } x")).toBe(1);
});

test("evaluate less than comparison", () => {
  expect(evaluate("1 < 2")).toBe(1);
});

test("evaluate if else expression", () => {
  expect(evaluate("let x = if (true) 3 else 5; x")).toBe(3);
});

test("evaluate chained if else expression", () => {
  expect(evaluate("let x = if (false) 3 else if (false) 5 else 7; x")).toBe(7);
});

test("evaluate if else statement", () => {
  expect(evaluate("let mut x = 0; if (true) x = 7; else x = 8; x")).toBe(7);
});

test("evaluate chained if else statement", () => {
  expect(evaluate("let mut x = 0; if (false) x = 7; else if (false) x = 8; else x = 9; x")).toBe(9);
});

test("evaluate chained if else statement with braces", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 7; } else if (false) { x = 8; } else { x = 9; } x")).toBe(9);
});

test("evaluate if false with braces does not execute then branch", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 7; } x")).toBe(0);
});

test("evaluate compound assignment +=", () => {
  expect(evaluate("let mut x = 1; x += 3; x")).toBe(4);
});

test("evaluate compound assignment on immutable variable throws error", () => {
  expect(() => evaluate("let x = 1; x += 3; x")).toThrow();
});

test("evaluate while loop", () => {
  expect(evaluate("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test("evaluate function definition and call", () => {
  expect(evaluate("fn get() => 100; get()")).toBe(100);
});

test("evaluate typed number literal", () => {
  expect(evaluate("100U8")).toBe(100);
});

test("evaluate typed number literal out of range throws error", () => {
  expect(() => evaluate("256U8")).toThrow();
});

test("evaluate typed variable declaration", () => {
  expect(evaluate("let x : U8 = 100U8; x")).toBe(100);
});

test("evaluate untyped let declaration returns 0", () => {
  expect(evaluate("let x = 100;")).toBe(0);
});

test("evaluate typed let declaration returns 0", () => {
  expect(evaluate("let x : U8 = 100;")).toBe(0);
});

test("evaluate typed let declaration out of range throws error", () => {
  expect(() => evaluate("let x : U8 = 256;")).toThrow();
});

test("evaluate typed let declaration type mismatch throws error", () => {
  expect(() => evaluate("let x : U8 = 0U16;")).toThrow();
});

test("evaluate typed let declaration from typed variable type mismatch throws error", () => {
  expect(() => evaluate("let x = 0U16; let y : U8 = x;")).toThrow();
});

test("evaluate Bool typed variable declaration", () => {
  expect(evaluate("let x : Bool = true; x")).toBe(1);
});

test("evaluate Bool typed variable with integer RHS throws error", () => {
  expect(() => evaluate("let x : Bool = 1;")).toThrow();
});

test("evaluate || with non-bool operand throws error", () => {
  expect(() => evaluate("true || 1")).toThrow();
});

test("evaluate typed function definition and call", () => {
  expect(evaluate("fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)")).toBe(7);
});

test("evaluate typed array declaration and indexing", () => {
  expect(evaluate("let array : [I32; 3] = [1, 2, 3]; array[0] + array[1] + array[2]")).toBe(6);
});

test("evaluate array element type mismatch throws error", () => {
  expect(() => evaluate("let x : [U8; 2] = [0U16, 1U16];")).toThrow();
});

test("evaluate array length mismatch throws error", () => {
  expect(() => evaluate("let x : [U8; 3] = [1U8, 2U8];")).toThrow();
});

test("evaluate empty struct definition", () => {
  expect(evaluate("struct Empty {}")).toBe(0);
});

test("evaluate struct with fields", () => {
  expect(evaluate("struct Wrapper { field : I32 }")).toBe(0);
});

test("evaluate struct with duplicate fields throws error", () => {
  expect(() => evaluate("struct Wrapper { field : I32, field : I32 }")).toThrow();
});

test("evaluate struct instance declaration", () => {
  expect(evaluate("struct Empty {} let empty : Empty = Empty {};")).toBe(0);
});

test("evaluate struct instance field type mismatch throws error", () => {
  expect(() => evaluate("struct Wrapper { field : I32 } let w : Wrapper = Wrapper { field : 1U8 };")).toThrow();
});

test("evaluate struct instance missing field throws error", () => {
  expect(() => evaluate("struct Wrapper { field : I32 } let w : Wrapper = Wrapper {};")).toThrow();
});

test("evaluate struct instance extra field throws error", () => {
  expect(() => evaluate("struct Wrapper { field : I32 } let w : Wrapper = Wrapper { field : 0, extra : 0 };")).toThrow();
});
test("evaluate mutable struct field assignment", () => {
  expect(evaluate("struct Wrapper { mut field : I32 } let mut w = Wrapper { field : 0 }; w.field = 5;")).toBe(0);
});

test("evaluate immutable struct field assignment throws error", () => {
  expect(() => evaluate("struct Wrapper { field : I32 } let mut w = Wrapper { field : 0 }; w.field = 5;")).toThrow();
});

test("evaluate mutable struct field on immutable instance throws error", () => {
  expect(() => evaluate("struct Wrapper { mut field : I32 } let w = Wrapper { field : 0 }; w.field = 5;")).toThrow();
});

test("evaluate assignment returns 0", () => {
  expect(evaluate("let mut x = 1; x = 2;")).toBe(0);
});

test("evaluate is type check", () => {
  expect(evaluate("100 is I32")).toBe(1);
});

test("evaluate is type check with typed literal", () => {
  expect(evaluate("100I32 is I32")).toBe(1);
});

test("evaluate is type check with parenthesized expression", () => {
  expect(evaluate("(100U8) is U8")).toBe(1);
});

test("evaluate generic function definition and call", () => {
  expect(evaluate("fn identity<T>(x : T) => x; identity(100)")).toBe(100);
});

test("evaluate generic function with typed argument", () => {
  expect(evaluate("fn identity<T>(x : T) => x; identity(100U8)")).toBe(100);
});