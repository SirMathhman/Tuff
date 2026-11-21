import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("let mut x = 0; fn increment() : Void => { x += 1; } increment(); x") => 1', () => {
  expect(interpretTuff("let mut x = 0; fn increment() : Void => { x += 1; } increment(); x")).toEqual({
    ok: true,
    value: 1,
  });
});

test("a Void call used as a value is an error", () => {
  expect(interpretTuff("fn f() : Void => { 1; } let x = f(); 1").ok).toBe(false);
});

test("a Void type cannot hold a value", () => {
  expect(interpretTuff("let x : Void = 1; 1").ok).toBe(false);
});
