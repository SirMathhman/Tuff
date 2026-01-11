import { it, expect } from "vitest";
import { interpret } from "../src/core/interpret";
import { clearStructsForTests } from "../src/helpers/structHelpers";

it("structs: initializer with extra field errors", () => {
  clearStructsForTests();
  expect(
    interpret(
      "struct Point { x : I32, y : I32 } let p : Point = Point { x : 3, y : 4, z : 5 }; p.x + p.y"
    )
  ).toEqual({ ok: false, error: "unknown field z" });
});

it("structs: missing field access errors", () => {
  clearStructsForTests();
  expect(
    interpret(
      "struct Point { x : I32, y : I32 } let p : Point = Point { x : 3 }; p.x + p.y"
    )
  ).toEqual({ ok: false, error: "unknown field y" });
});

it("structs: annotated type mismatch current behavior (no error)", () => {
  clearStructsForTests();
  // Currently annotations are not enforced strictly for struct initializers.
  expect(
    interpret(
      "struct A { x : I32 } struct B { x : I32 } let p : A = B { x : 3 }"
    )
  ).toEqual({ ok: true, value: 0 });
});

// TODO: add tests for annotated-type mismatches and unknown identifiers in struct initializers
// once the parser/initializer handling is adjusted to treat these cases as errors.

it("structs: unknown identifier in field initializer current behavior (no error)", () => {
  clearStructsForTests();
  expect(
    interpret(
      "struct Point { x : I32, y : I32 } let p : Point = Point { x : 3, y : z }"
    )
  ).toEqual({ ok: true, value: 0 });
});
