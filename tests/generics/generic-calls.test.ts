import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test("interpretTuff a variable named like a generic function is a comparison, not type arguments => true", () => {
  expect(interpretTuff("fn pass<T>(v : T) : T => v; { let pass = 3; pass < 4 }")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff generic Void function called as a statement => 5", () => {
  expect(interpretTuff("fn show<T>(v : T) : Void => {} show<I32>(1); 5")).toEqual({ ok: true, value: 5 });
});

test("interpretTuff generic Void function called in an expression is an error that suggests a statement call", () => {
  expect(interpretTuff("fn show<T>(v : T) : Void => {} let x = show<I32>(1); 5")).toEqual(
    expect.objectContaining({ ok: false, error: expect.stringContaining("call it as a statement") }),
  );
});
