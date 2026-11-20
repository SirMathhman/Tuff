import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test("interpretTuff('1') => 1", () => {
  expect(interpretTuff("1")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('1 + 2') => 3", () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test("interpretTuff('1 + 2 + 3') => 6", () => {
  expect(interpretTuff("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test("interpretTuff('2 + 3 - 4') => 1", () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('2 * 3 + 4') => 10", () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test("interpretTuff('2 + 3 * 4') => 14", () => {
  expect(interpretTuff("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test("interpretTuff('(2 + 3) * 4') => 20", () => {
  expect(interpretTuff("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('{ 2 + 3 } * 4') => 20", () => {
  expect(interpretTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('{ let x = 2 + 3; x } * 4') => 20", () => {
  expect(interpretTuff("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('let y = { let x = 2 + 3; x } * 4; y') => 20", () => {
  expect(interpretTuff("let y = { let x = 2 + 3; x } * 4; y")).toEqual({ ok: true, value: 20 });
});

test("interpretTuff('let mut x = 0; x = 1; x') => 1", () => {
  expect(interpretTuff("let mut x = 0; x = 1; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff assignment to an immutable variable is rejected", () => {
  const result = interpretTuff("let x = 0; x = 1; x");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('found "x" where a mutable variable (declare "x" with "let mut") was expected');
});

test("interpretTuff('let x = true; x') => 1", () => {
  expect(interpretTuff("let x = true; x")).toEqual({ ok: true, value: 1 });
});

test("interpretTuff('false') => 0", () => {
  expect(interpretTuff("false")).toEqual({ ok: true, value: 0 });
});

test("interpretTuff('let true = 1; true') is rejected", () => {
  expect(interpretTuff("let true = 1; true").ok).toBe(false);
});

test("interpretTuff('(1 + 2}') reports the expected closing character", () => {
  const result = interpretTuff("(1 + 2}");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('Where: line 1, column 7, found "}" where ")" was expected');
});

test("interpretTuff('1 +') reports what, where, why, and the fix", () => {
  const result = interpretTuff("1 +");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain("What: unsupported Tuff source");
  expect(result.error).toContain('Where: line 1, column 4, found end of input where a number, a variable, "(" or "{" was expected');
  expect(result.error).toContain("Why: ");
  expect(result.error).toContain('Fix: change the source to a form such as "1", "1 + 2 * 3", or "(1 + 2) * 3"');
});

test("interpretTuff('(1 + 2') reports the missing closing parenthesis", () => {
  const result = interpretTuff("(1 + 2");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('Where: line 1, column 7, found end of input where ")" was expected');
});

test("interpretTuff('1 x 2') points at the offending character", () => {
  const result = interpretTuff("1 x 2");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toContain('Where: line 1, column 3, found "x" where "+", "-", "*" or end of input was expected');
});
