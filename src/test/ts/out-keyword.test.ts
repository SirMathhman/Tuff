import { test } from "bun:test";
import { expectValid, expectInvalid } from "./test-helpers";

// --- Positive cases: out let ---

test("out let exports a variable", () => {
  expectValid("out let x: I32 = 42I32; x", [], 42);
});

test("out let with boolean type", () => {
  expectValid("out let flag: Bool = true; flag", [], 1);
});

test("out let with struct type and member access", () => {
  expectValid(
    "struct Point { x : I32 }; out let p: Point = Point { x: 10 }; p.x",
    [],
    10,
  );
});

test("multiple out let declarations", () => {
  expectValid("out let a: I32 = 1I32; out let b: I32 = 99I32; b", [], 99);
});

test("out let with mutable variable", () => {
  expectValid("out let mut x: I32 = 5I32; x = 10I32; x", [], 10);
});

test("out let without type annotation", () => {
  expectValid("out let x = 42; x", [], 42);
});

// --- Positive cases: out struct ---

test("out struct exports a struct definition", () => {
  expectValid(
    "out struct Point { x : I32, y : I32 }; let p: Point = Point { x: 1, y: 2 }; p.x",
    [],
    1,
  );
});

test("out struct with generic type params", () => {
  expectValid(
    "out struct Box<T> { val : T }; let b: Box<I32> = Box { val: 42I32 }; b.val",
    [],
    42,
  );
});

test("out struct used by out let", () => {
  expectValid(
    "out struct Vec { x : I32 }; out let v: Vec = Vec { x: 7 }; v.x",
    [],
    7,
  );
});

// --- Positive cases: out type ---

test("out type alias exports a type alias", () => {
  expectValid("out type Int = I32; let x: Int = 99I32; x", [], 99);
});

test("out type alias used in struct", () => {
  expectValid(
    "out type Coord = I32; struct Point { x : Coord }; let p: Point = Point { x: 5 }; p.x",
    [],
    5,
  );
});

// --- Positive cases: out enum ---

test("out enum exports an enum definition", () => {
  expectValid(
    "out enum Color { Red, Green, Blue }; let c: Color = Color.Red; c is Color",
    [],
    1,
  );
});

test("out enum with single variant", () => {
  expectValid(
    "out enum Unit { One }; let u: Unit = Unit.One; u is Unit",
    [],
    1,
  );
});

test("out enum with trailing comma", () => {
  expectValid(
    "out enum Status { Ok, Err, }; let s: Status = Status.Ok; s is Status",
    [],
    1,
  );
});

// --- Combined: out with non-out declarations ---

test("out and non-out declarations mixed", () => {
  expectValid(
    "out let exported: I32 = 1I32; let local: I32 = 99I32; local",
    [],
    99,
  );
});

test("out struct used by non-out let", () => {
  expectValid(
    "out struct Vec { x : I32 }; let v: Vec = Vec { x: 5 }; v.x",
    [],
    5,
  );
});

test("out type used by non-out let", () => {
  expectValid("out type MyInt = I32; let x: MyInt = 7I32; x", [], 7);
});

test("out enum used by non-out let", () => {
  expectValid(
    "out enum Color { Red, Green }; let c: Color = Color.Green; c is Color",
    [],
    1,
  );
});

test("all four out declaration types together", () => {
  expectValid(
    "out struct S { x : I32 }; out type T = I32; out enum E { A, B }; out let v: I32 = 42I32; v",
    [],
    42,
  );
});

// --- Negative cases: out alone ---

test("out with no following declaration", () => {
  expectInvalid("out");
});

test("out followed by number literal", () => {
  expectInvalid("out 42");
});

test("out followed by boolean", () => {
  expectInvalid("out true");
});

test("out followed by identifier expression (not declaration)", () => {
  expectInvalid("let x: I32 = 1I32; out x");
});

// --- Negative cases: double out ---

test("out out let is invalid", () => {
  expectInvalid("out out let x: I32 = 1I32");
});

test("out out struct is invalid", () => {
  expectInvalid("out out struct Foo { x : I32 }");
});

test("out out type is invalid", () => {
  expectInvalid("out out type X = I32");
});

test("out out enum is invalid", () => {
  expectInvalid("out out enum E { A }");
});

// --- Negative cases: out on non-declaration ---

test("out followed by string literal", () => {
  expectInvalid('out "hello"');
});

test("out followed by assignment expression", () => {
  expectInvalid("let x: I32 = 1I32; out x = 2I32");
});
