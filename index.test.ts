import { executeTuff } from ".";
import { test, expect } from "bun:test";

// --- Basic evaluation ---

test("empty source returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

test("whitespace-only source returns 0", () => {
  expect(executeTuff("   ")).toBe(0);
  expect(executeTuff("\t\n")).toBe(0);
});

test("plain number literal evaluates to its value", () => {
  expect(executeTuff("100")).toBe(100);
});

// --- Arithmetic expressions ---

test("addition of two numbers", () => {
  expect(executeTuff("1 + 2")).toBe(3);
});

test("block expression evaluates to its value", () => {
  expect(executeTuff("{ 1 + 2 }"));
});

test("block on left side of addition", () => {
  expect(executeTuff("{ 1 } + 2")).toBe(3);
});

test("both operands as blocks in addition", () => {
  expect(executeTuff("{ 1 } + { 2 }")).toBe(3);
});

test("nested block expressions evaluate correctly", () => {
  expect(executeTuff("{{ 1 } + { 2 }}")).toBe(3);
});

// --- Variables and scoping ---

test("block with variable declaration returns last expression", () => {
  expect(executeTuff("{ let x = 1 + 2; x }")).toBe(3);
});

test("variable assigned from block expression", () => {
  expect(executeTuff("let y = { let x = 1 + 2; x }; y")).toBe(3);
});

test("mutable variable reassignment", () => {
  expect(executeTuff("let mut x = 0; x = 3; x")).toBe(3);
});

test("array literal with index access", () => {
  expect(executeTuff("let array = [1, 2, 3]; array[0]")).toBe(1);
});

test("mutable array element mutation", () => {
  expect(executeTuff("let mut array = [0]; array[0] = 100; array[0]")).toBe(
    100,
  );
});

test("variable shadowing in same scope", () => {
  expect(executeTuff("let x = 0; let x = 100; x")).toBe(100);
});

test("mutable variable modified inside nested block persists outward", () => {
  expect(executeTuff("let mut x = 0; { x = 100; } x")).toBe(100);
});

test("inner shadowing does not affect outer scope", () => {
  expect(executeTuff("let mut x = 5; { let x = 100; } x")).toBe(5);
});

// --- Booleans and conditionals ---

test("true boolean literal evaluates to 1", () => {
  expect(executeTuff("let x = true; x")).toBe(1);
});

test("if/else with true condition returns then-branch value", () => {
  expect(executeTuff("let x = if (true) 3 else 5; x")).toBe(3);
});

test("mutable variable modified by if/else statement", () => {
  expect(executeTuff("let mut x = 0; if (true) x = 3; else x = 5; x")).toBe(3);
});

// --- Compound assignment ---

test("compound += on immutable variable throws error", () => {
  expect(() => executeTuff("let x = 0; x += 1; x")).toThrow();
});

test("compound += on mutable variable works", () => {
  expect(executeTuff("let mut x = 0; x += 1; x")).toBe(1);
});

test("compound -= subtracts from mutable variable", () => {
  expect(executeTuff("let mut x = 5; x -= 2; x")).toBe(3);
});

// --- Boolean and conditional branches ---

test("false boolean literal evaluates to 0", () => {
  expect(executeTuff("let x = false; x")).toBe(0);
});

test("if/else with false condition returns else-branch value", () => {
  expect(executeTuff("let x = if (false) 3 else 5; x")).toBe(5);
});

// --- Operators ---

test("division operator", () => {
  expect(executeTuff("10 / 2")).toBe(5);
});

test("unary minus on primary expression", () => {
  expect(executeTuff("-3 + 2")).toBe(-1);
});

// --- Arrays and indexing ---

test("nested array index access (chained brackets)", () => {
  expect(executeTuff("let arr = [[1, 2], [3, 4]]; arr[0][1]")).toBe(2);
});

// --- Loops ---

test("while loop with mutable counter", () => {
  expect(executeTuff("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test("for loop over range accumulates sum", () => {
  expect(executeTuff("let mut sum = 0; for (i in 0..4) sum += i; sum")).toBe(6);
});

// --- Comparison operators ---

test("< comparison between variables returns true", () => {
  expect(executeTuff("let x = 0; let y = 1; x < y")).toBe(1);
});

test("> comparison between variables returns false", () => {
  expect(executeTuff("let x = 0; let y = 1; x > y")).toBe(0);
});

test("<= comparison with equal values returns true", () => {
  expect(executeTuff("let x = 1; let y = 1; x <= y")).toBe(1);
});

test(">= comparison with greater value returns true", () => {
  expect(executeTuff("let x = 2; let y = 1; x >= y")).toBe(1);
});

test("== equality comparison between equal values", () => {
  expect(executeTuff("let x = 5; let y = 5; x == y")).toBe(1);
});

test("!= inequality comparison between different values", () => {
  expect(executeTuff("let x = 3; let y = 7; x != y")).toBe(1);
});

// --- Functions ---

test("function with typed parameter and return type", () => {
  expect(executeTuff("fn pass(first : I32) : I32 => first; pass(100)")).toBe(
    100,
  );
});

test("cross-function calls resolve correctly", () => {
  expect(executeTuff("fn a() => b(); fn b() => 100; a()")).toBe(100);
});

test("function definition and call without parameters", () => {
  expect(executeTuff("fn get() => 100; get()")).toBe(100);
});

test("function with parameters and argument passing", () => {
  expect(
    executeTuff("fn add(first, second) => first + second; add(3, 4)"),
  ).toBe(7);
});

test("duplicate parameter names throw error", () => {
  expect(() =>
    executeTuff("fn pass(first : I32, first : I32) => {}"),
  ).toThrow();
});

test("function with typed array parameter and index access", () => {
  expect(
    executeTuff("fn add(array : [I32; 2]) => array[0] + array[1]; add([1, 2])"),
  ).toBe(3);
});

test("calling undefined function throws error", () => {
  expect(() => executeTuff("undefinedFn()")).toThrow();
});

test("accessing property on non-object throws error", () => {
  expect(() => executeTuff("let x = 42; x.prop")).toThrow();
});

test("if expression with else branch evaluates correctly", () => {
  expect(executeTuff("if (1) { 10 } else { 20 }")).toBe(10);
});

test("nested block with declarations creates child scope", () => {
  expect(() => executeTuff("{ let x = 5; }; x")).toThrow();
});

test("declaring variable with object literal works", () => {
  expect(executeTuff("let obj = { a : 1, b : 2 }; obj.a + obj.b")).toBe(3);
});

test("object property access on point struct", () => {
  expect(executeTuff("let point = { x : 1, y : 2 }; point.x + point.y")).toBe(
    3,
  );
});

test("typed struct literal with object property access", () => {
  expect(
    executeTuff(
      "let point : { x : I32, y : I32 } = { x : 1, y : 2 }; point.x + point.y",
    ),
  ).toBe(3);
});

test("type alias for struct with typed variable declaration", () => {
  expect(
    executeTuff(
      "type Point = { x : I32, y : I32 }; let point : Point = { x : 1, y : 2 }; point.x + point.y",
    ),
  ).toBe(3);
});

test("function with Void return type", () => {
  expect(executeTuff("fn empty() : Void => {}")).toBe(0);
});

test("mut keyword allows compound assignment on indexed array element", () => {
  expect(() =>
    executeTuff("mut arr = [10, 20]; arr[0] += 5; arr[0]"),
  ).toThrow();
});

test("if expression with false condition returns else branch", () => {
  expect(executeTuff("if (0) { 10 } else { 20 }")).toBe(20);
});

// --- Numeric type suffixes ---

test("numeric literal with U8 suffix evaluates correctly", () => {
  expect(executeTuff("100U8")).toBe(100);
});

test("negative unsigned literal throws error", () => {
  expect(() => executeTuff("-100U8")).toThrow();
});

test("negative signed literal evaluates correctly", () => {
  expect(executeTuff("-100I8")).toBe(-100);
});

// --- is type-checking operator ---

test("is operator matches negative signed type", () => {
  expect(executeTuff("-100I8 is I8")).toBe(1);
});

test("plain number defaults to I32 for is check", () => {
  expect(executeTuff("100 is I32")).toBe(1);
});

test("is operator returns false for mismatched unsigned type", () => {
  expect(executeTuff("100 is U32")).toBe(0);
});

test("is operator returns false for narrower signed type", () => {
  expect(executeTuff("100 is I8")).toBe(0);
});

// --- Type promotion in expressions ---

test("same-type addition preserves type (U8 + U8 → U8)", () => {
  expect(executeTuff("(1U8 + 2U8) is U8")).toBe(1);
});

test("mixed bit-width addition promotes to wider type (U8 + U16 → U16)", () => {
  expect(executeTuff("(1U8 + 2U16) is U16")).toBe(1);
});

test("same-width mixed signedness promotes to next wider signed (U8 + I8 → I16)", () => {
  expect(executeTuff("(1U8 + 2I8) is I16")).toBe(1);
});

test("plain number yields to explicit narrower type in addition", () => {
  expect(executeTuff("(1 + 1U8) is U8")).toBe(1);
});

test("plain number yields to explicit signed narrower type (I16)", () => {
  expect(executeTuff("(1 + 1I16) is I16")).toBe(1);
});

test("nested promotion chain: plain yields to promoted inner result", () => {
  expect(executeTuff("(1 + (1U8 + 1I8)) is I16")).toBe(1);
});

// --- Declaration-only sources ---

test("declaration without trailing expression returns 0", () => {
  expect(executeTuff("let x = 100;")).toBe(0);
});

// --- Type annotations ---

test("type-annotated variable with matching type works", () => {
  expect(executeTuff("let x : U8 = 100U8; x")).toBe(100);
});

test("type-annotated variable rejects wider RHS type (narrowing)", () => {
  expect(() => executeTuff("let x : U8 = 100U16;")).toThrow();
});

test("type-annotated variable allows narrower RHS type (widening: U8 → U16)", () => {
  expect(executeTuff("let x : U16 = 100U8; x")).toBe(100);
});

test("variable reference carries inferred type for annotation validation", () => {
  expect(() => executeTuff("let x = 100U16; let y : U8 = x;")).toThrow();
});

// --- Error handling ---

test("invalid source throws error", () => {
  expect(() => executeTuff("invalid")).toThrow();
});
