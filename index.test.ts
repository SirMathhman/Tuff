import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test("interpretTuff('1') => 1", () => {
  expect(interpretTuff("1")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('1 + 2') => 3", () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test("interpretTuff('1 +') reports what, where, why, and the fix", () => {
  const result = interpretTuff("1 +");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain("What: unsupported Tuff source");
  expect(result.error).toContain("Where: line 1, column 4, found end of input where a number was expected");
  expect(result.error).toContain("Why: ");
  expect(result.error).toContain('Fix: change the source to a form such as "1" or "1 + 2"');
});

test("interpretTuff('1 x 2') points at the offending character", () => {
  const result = interpretTuff("1 x 2");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('Where: line 1, column 3, found "x" where "+" or end of input was expected');
});
