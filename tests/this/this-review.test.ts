import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test("a bare this snapshot keeps the value it had when it was read", () => {
  expect(interpretTuff("let mut x = 1; let s = this; x = 2; s.x")).toEqual({ ok: true, value: 1 });
});

test("a bare this snapshot may not outlive a reference it holds", () => {
  expect(interpretTuff("fn W() => { let x = 1; let r = &x; this } W().r").ok).toBe(false);
});

test("a call result can be indexed", () => {
  expect(interpretTuff("fn A() => [1, 2]; A()[1]")).toEqual({ ok: true, value: 2 });
});

test("inside an object body, a block nested in the body reads an exported name", () => {
  expect(interpretTuff("object O { out let x = 2; let y = { this.x }; out let g = y; } O.g")).toEqual({
    ok: true,
    value: 2,
  });
});
