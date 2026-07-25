import { test } from "bun:test";
import { expectValid, expectInvalid } from "./test-helpers";

// --- Positive cases ---

test("Declare enum and use variant as exit code", () => {
  expectValid(
    "enum Color { Red, Green, Blue }; let c : Color = Color.Red; c",
    [],
    0,
  );
});

test("Enum variant truthy value", () => {
  expectValid(
    "enum Color { Red, Green, Blue }; let c : Color = Color.Red; c",
    [],
    0,
  );
});

test("Enum in struct field", () => {
  expectValid(
    "enum Color { Red, Green, Blue }; struct Foo { color: Color }; let f : Foo = Foo { color: Color.Red }; f.color",
    [],
    0,
  );
});

test("is expression with enum type (true)", () => {
  expectValid(
    "enum Color { Red, Green, Blue }; let c : Color = Color.Red; c is Color",
    [],
    1,
  );
});

test("is expression with enum type (false) - numeric", () => {
  expectValid(
    "enum Color { Red, Green, Blue }; let x : I32 = 42I32; x is Color",
    [],
    0,
  );
});

test("Enum with single variant", () => {
  expectValid("enum Foo { Bar }; let f : Foo = Foo.Bar; f", [], 0);
});

test("Enum with trailing comma", () => {
  expectValid(
    "enum Color { Red, Green, Blue, }; let c : Color = Color.Blue; c",
    [],
    0,
  );
});

test("Multiple enums", () => {
  expectValid(
    "enum A { X, Y }; enum B { P, Q }; let a : A = A.X; let b : B = B.P; a is A",
    [],
    1,
  );
});

test("Enum variant assigned to let without type annotation", () => {
  expectValid(
    "enum Color { Red, Green }; let c = Color.Red; c is Color",
    [],
    1,
  );
});

// --- Negative cases ---

test("Enum with duplicate variant names", () => {
  expectInvalid("enum Color { Red, Red, Blue }");
});

test("Undefined enum variant", () => {
  expectInvalid("enum Color { Red, Green, Blue }; Color.Yellow");
});

test("Undefined enum type", () => {
  expectInvalid("let c : Color = Color.Red");
});

test("Type mismatch: assign wrong enum variant", () => {
  expectInvalid("enum A { X, Y }; enum B { P, Q }; let a : A = B.P");
});

test("Empty enum is invalid", () => {
  expectInvalid("enum Foo {}");
});

test("Enum variant with invalid name (starts with digit)", () => {
  expectInvalid("enum Foo { 1bar }");
});

test("Missing closing brace", () => {
  expectInvalid("enum Color { Red, Green, Blue");
});
