import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test("interpretTuff('struct Point { x : I32, y : I32 } let { x, y } = Point { x : 3, y : 4 }; x + y') => 7", () => {
  expect(interpretTuff("struct Point { x : I32, y : I32 } let { x, y } = Point { x : 3, y : 4 }; x + y")).toEqual({
    ok: true,
    value: 7,
  });
});

test("destructuring a name that is not a field is an error", () => {
  expect(interpretTuff("struct P { x : I32 } let { z } = P { x : 1 }; z").ok).toBe(false);
});

test("destructuring a number is an error", () => {
  expect(interpretTuff("let { x } = 1; x").ok).toBe(false);
});

test("destructured let mut bindings can be assigned", () => {
  expect(interpretTuff("struct P { x : I32 } let mut { x } = P { x : 1 }; x = 2; x")).toEqual({ ok: true, value: 2 });
});

test("destructured let bindings are immutable", () => {
  expect(interpretTuff("struct P { x : I32 } let { x } = P { x : 1 }; x = 2; x").ok).toBe(false);
});
