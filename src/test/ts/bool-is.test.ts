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
