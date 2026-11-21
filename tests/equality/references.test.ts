import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test("references to separately built structs with equal fields are not equal", () => {
  expect(interpretTuff("struct P { x : I32 } let p = P { x : 1 }; let q = P { x : 1 }; &p == &q")).toEqual({
    ok: true,
    value: 0,
  });
});

test("references to separately built arrays with equal elements are not equal", () => {
  expect(interpretTuff("let x = [1]; let y = [1]; &x == &y")).toEqual({ ok: true, value: 0 });
});

test("references to equal scalars are equal", () => {
  expect(interpretTuff("let a = 1; let b = 1; &a == &b")).toEqual({ ok: true, value: 1 });
});

test("references to distinct objects with equal exports are not equal", () => {
  expect(interpretTuff("object A { out let x = 1; } object B { out let x = 1; } &A == &B")).toEqual({
    ok: true,
    value: 0,
  });
});

test("a number compared with a reference is an error", () => {
  expect(interpretTuff("1 == &1").ok).toBe(false);
});
