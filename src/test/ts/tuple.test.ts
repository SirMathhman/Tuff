import { test } from "bun:test";
import { expectValid, expectInvalid } from "./test-helpers";

// --- Positive cases ---

test("Tuple with two I32 elements, access first", () => {
  expectValid("let t : (I32, I32) = (1I32, 2I32); t.0", [], 1);
});

test("Tuple with two I32 elements, access second", () => {
  expectValid("let t : (I32, I32) = (1I32, 2I32); t.1", [], 2);
});

test("Single-element tuple with trailing comma", () => {
  expectValid("let t : (I32,) = (42I32,); t.0", [], 42);
});

test("Parenthesized expression is not a tuple", () => {
  expectValid("(42I32)", [], 42);
});

test("Tuple with Bool field", () => {
  expectValid("let t : (I32, Bool) = (1I32, true); t.1", [], 1);
});

test("Tuple as exit expression coerces to 0", () => {
  expectValid("let t : (I32, I32) = (1I32, 2I32); t", [], 0);
});

test("Nested tuples", () => {
  expectValid(
    "let t : (I32, (Bool, I32)) = (1I32, (true, 2I32)); t.1.0",
    [],
    1,
  );
});

test("Tuple in struct field", () => {
  expectValid(
    "struct Foo { a : (I32, I32) }; let f : Foo = Foo { a: (1I32, 2I32) }; f.a.0",
    [],
    1,
  );
});

test("Three-element tuple", () => {
  expectValid("let t : (I32, I32, I32) = (1I32, 2I32, 3I32); t.2", [], 3);
});

test("is expression with tuple type (true)", () => {
  expectValid("let t : (I32, I32) = (1I32, 2I32); t is (I32, I32)", [], 1);
});

test("is expression with tuple type (false) - wrong element type", () => {
  expectValid("let t : (I32, I32) = (1I32, 2I32); t is (Bool, I32)", [], 0);
});

test("is expression with tuple type (false) - wrong length", () => {
  expectValid("let t : (I32, I32) = (1I32, 2I32); t is (I32, I32, I32)", [], 0);
});

test("Inferred tuple type from value", () => {
  expectValid("let t = (1I32, 2I32); t.0", [], 1);
});

test("Tuple with four elements", () => {
  expectValid(
    "let t : (I32, I32, I32, I32) = (1I32, 2I32, 3I32, 4I32); t.3",
    [],
    4,
  );
});

// --- Negative cases ---

test("Type mismatch in tuple literal", () => {
  expectInvalid("let t : (I32, Bool) = (1I32, 2I32);");
});

test("Wrong element count (too many)", () => {
  expectInvalid("let t : (I32, I32) = (1I32, 2I32, 3I32);");
});

test("Wrong element count (too few)", () => {
  expectInvalid("let t : (I32, I32, I32) = (1I32, 2I32);");
});

test("Tuple index out of bounds", () => {
  expectInvalid("let t : (I32, I32) = (1I32, 2I32); t.2");
});

test("Empty tuple is not supported", () => {
  expectInvalid("let t : () = ();");
});

test("Tuple element assignment is not allowed", () => {
  expectInvalid("let t : (I32, I32) = (1I32, 2I32); t.0 = 42I32");
});

test("Type mismatch in nested tuple", () => {
  expectInvalid("let t : (I32, (Bool, I32)) = (1I32, (2I32, 3I32));");
});

test("Index on non-tuple type is invalid", () => {
  expectInvalid("let x : I32 = 42I32; x.0");
});
