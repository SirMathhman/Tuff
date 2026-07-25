import { test } from "bun:test";
import { expectValid, expectInvalid } from "./test-helpers";

test("True literal", () => {
  expectValid("true", [], 1);
});

test("False literal", () => {
  expectValid("false", [], 0);
});

test("Let bool true", () => {
  expectValid("let b : Bool = true; b", [], 1);
});

test("Let bool false", () => {
  expectValid("let b : Bool = false; b", [], 0);
});

test("Bool without type annotation is invalid", () => {
  expectInvalid("let b = true;");
});

test("Bool type mismatch is invalid", () => {
  expectInvalid("let b : Bool = 42;");
});

test("Bool type mismatch with true is invalid", () => {
  expectInvalid("let b : U8 = true;");
});

test("Is expression with struct type", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 1I32, y: 2I32 }; p is Point",
    [],
    1,
  );
});

test("Is expression with numeric type", () => {
  expectValid("let x : I32 = 42I32; x is I32", [], 1);
});

test("Is expression false case", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let x : I32 = 42I32; x is Point",
    [],
    0,
  );
});

test("Is expression with Bool annotation", () => {
  expectValid(
    "struct Point { x : I32 }; let b : Bool = Point { x: 1I32 } is Point; b",
    [],
    1,
  );
});

test("Is expression with invalid type is invalid", () => {
  expectInvalid("let x : I32 = 42I32; x is NonExistent;");
});

test("Is expression with member access", () => {
  expectValid(
    "struct Inner { v : I32 }; struct Outer { inner : Inner }; let o : Outer = Outer { inner: Inner { v: 1I32 } }; o.inner is Inner",
    [],
    1,
  );
});

// --- Structural distinction tests (will fail with current broken implementation) ---

test("Is expression distinguishes different structs — false case", () => {
  expectValid(
    "struct Point { x : I32 }; struct Line { x : I32 }; let p : Point = Point { x: 1I32 }; p is Line",
    [],
    0,
  );
});

test("Is expression Bool variable with Bool type — true case", () => {
  expectValid("let b : Bool = false; b is Bool", [], 1);
});

test("Is expression I32 variable with Bool type — false case", () => {
  expectValid("let x : I32 = 42I32; x is Bool", [], 0);
});

test("Is expression struct instance with numeric type — false case", () => {
  expectValid(
    "struct Point { x : I32 }; let p : Point = Point { x: 1I32 }; p is I32",
    [],
    0,
  );
});

test("Is expression numeric variable with struct type — false case", () => {
  expectValid(
    "struct Point { x : I32 }; let n : I32 = 42I32; n is Point",
    [],
    0,
  );
});

test("Is expression with generic struct checks base type only — true case", () => {
  expectValid(
    "struct Box<T> { val : T }; let b : Box<I32> = Box { val: 1I32 }; b is Box<I32>",
    [],
    1,
  );
});

test("Is expression with generic struct wrong base — false case", () => {
  expectValid(
    "struct Box<T> { val : T }; struct Tag<N> { n : N }; let b : Box<I32> = Box { val: 1I32 }; b is Tag<I32>",
    [],
    0,
  );
});

test("Is expression with number literal", () => {
  expectValid("42I32 is I32", [], 1);
});

test("Is expression number literal with struct type — false case", () => {
  expectValid("struct Point { x : I32 }; 42I32 is Point", [], 0);
});

test("Is expression bool literal with Bool type — true case", () => {
  expectValid("true is Bool", [], 1);
});

test("Is expression bool literal with numeric type — false case", () => {
  expectValid("true is I32", [], 0);
});
