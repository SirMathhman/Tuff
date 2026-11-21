import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("let x = 1; this.x") => 1', () => {
  expect(interpretTuff("let x = 1;\nthis.x")).toEqual({ ok: true, value: 1 });
});

test("inside an object body, this.name reads an exported name and not a private one", () => {
  expect(interpretTuff("object O { out let x = 2; out let g = this.x + 1; } O.g")).toEqual({ ok: true, value: 3 });
  expect(interpretTuff("object O { out let x = 2; let p = 3; out let g = this.p; } O.g").ok).toBe(false);
});
