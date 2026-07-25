import { test } from "bun:test";
import { expectValid, expectInvalid } from "./test-helpers";

test("Simple type alias", () => {
  expectValid("type MyInt = I32; let x : MyInt = 42I32; x", [], 42);
});

test("Type alias with U8", () => {
  expectValid("type Byte = U8; let b : Byte = 100U8; b", [], 100);
});

test("Type alias used in struct field", () => {
  expectValid(
    "type Coord = I32; struct Point { x : Coord, y : Coord }; let p : Point = Point { x: 1I32, y: 2I32 }; p.y",
    [],
    2,
  );
});

test("Generic type alias", () => {
  expectValid(
    "struct Pair<T, U> { first : T, second : U }; type IntPair = Pair<I32, I32>; let p : IntPair = Pair { first: 1I32, second: 2I32 }; p.second",
    [],
    2,
  );
});

test("Generic type alias with type params", () => {
  expectValid(
    "struct Pair<T, U> { first : T, second : U }; type Alias<T> = Pair<T, T>; let p : Alias<I32> = Pair { first: 5I32, second: 10I32 }; p.first",
    [],
    5,
  );
});

test("Generic type alias with multiple type params", () => {
  expectValid(
    "struct Triple<T, U, V> { a : T, b : U, c : V }; type MyTriple<T, U> = Triple<T, U, I32>; let t : MyTriple<U8, I32> = Triple { a: 1U8, b: 2I32, c: 3I32 }; t.a",
    [],
    1,
  );
});

test("Type alias chaining", () => {
  expectValid("type A = I32; type B = A; let x : B = 42I32; x", [], 42);
});

test("Type alias without usage is valid", () => {
  expectValid("type MyInt = I32; 42", [], 42);
});

test("Type alias with undefined type is invalid", () => {
  expectInvalid("type MyInt = UnknownType;");
});

test("Type alias with generic referencing undefined struct is invalid", () => {
  expectInvalid(
    "struct Pair<T, U> { first : T, second : U }; type Alias<T> = NonExistent<T>;",
  );
});

test("Generic type alias missing required type arg is invalid", () => {
  expectInvalid(
    "struct Pair<T, U> { first : T, second : U }; type Alias<T> = Pair<T>; let x : Alias<I32> = Pair { first: 1I32, second: 2I32 };",
  );
});

test("Type alias circular reference is invalid", () => {
  expectInvalid("type A = B; type B = A;");
});

test("Type alias self-reference is invalid", () => {
  expectInvalid("type A = A;");
});

test("Type alias used in assignment type check", () => {
  expectInvalid("type MyInt = I32; let x : MyInt = 42U8;");
});

test("Type alias in struct field type mismatch", () => {
  expectInvalid(
    "type Coord = I32; struct Point { x : Coord }; let p : Point = Point { x: 10U8 };",
  );
});
