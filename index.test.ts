import { expect, test } from "bun:test";
import { interpretTuff } from "./index.ts";

test('interpretTuff("1") => 1', () => {
  expect(interpretTuff("1")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('interpretTuff("2 + 3 - 4") => 1', () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("2 * 3 + 4") => 10', () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
});

test('interpretTuff("2 + 3 * 4") => 14', () => {
  expect(interpretTuff("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
});

test('interpretTuff("2 * 3 * 4") => 24', () => {
  expect(interpretTuff("2 * 3 * 4")).toEqual({ ok: true, value: 24 });
});

test('interpretTuff("1 + 2 * 3 - 4 * 5") => -13', () => {
  expect(interpretTuff("1 + 2 * 3 - 4 * 5")).toEqual({ ok: true, value: -13 });
});

test('interpretTuff("2 *") => error', () => {
  expect(interpretTuff("2 *")).toEqual({ ok: false, error: expect.any(String) });
});

test('interpretTuff("2 - * 3") => error', () => {
  expect(interpretTuff("2 - * 3")).toEqual({ ok: false, error: expect.any(String) });
});

test('interpretTuff("2 3") => error', () => {
  expect(interpretTuff("2 3")).toEqual({ ok: false, error: expect.any(String) });
});
