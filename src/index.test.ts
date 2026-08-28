import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toEqual({ ok: true, value: 1 });
});

test('evaluate("1 + 2") => 3', () => {
  expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('evaluate("1 + 2 + 3") => 6', () => {
  expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test('evaluate("2 + 3 - 4") => 1', () => {
  expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('evaluate("abc") => error', () => {
  expect(evaluate("abc")).toEqual({
    ok: false,
    error: { kind: "invalid-number", input: "abc", position: 0 },
  });
});
