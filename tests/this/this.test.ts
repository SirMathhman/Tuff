import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("let x = 1; this.x") => 1', () => {
  expect(interpretTuff("let x = 1;\nthis.x")).toEqual({ ok: true, value: 1 });
});

test("inside an object body, this.name reads an exported name and not a private one", () => {
  expect(interpretTuff("object O { out let x = 2; out let g = this.x + 1; } O.g")).toEqual({ ok: true, value: 3 });
  expect(interpretTuff("object O { out let x = 2; let p = 3; out let g = this.p; } O.g").ok).toBe(false);
});

test("inside an object body, a block nested in the body reads an exported name", () => {
  expect(interpretTuff("object O { out let x = 2; let y = { this.x }; out let g = y; } O.g")).toEqual({
    ok: true,
    value: 2,
  });
});

test("this.f on an out fn is an error that says the function is called, not read", () => {
  const result = interpretTuff("object O { out let x = 2; out fn f() : Void => { } out let g = this.f; } O.g");
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.error).toContain("called");
});

test("this does not read a variable of an enclosing scope", () => {
  expect(interpretTuff("let x = 1; { this.x }").ok).toBe(false);
});
