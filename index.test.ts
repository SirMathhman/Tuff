import { expect, test } from "bun:test";
import { interpretTuff } from "./index";

test('interpretTuff("5") => 5', () => {
  expect(interpretTuff("5")).toEqual({ ok: true, value: 5 });
});

test('interpretTuff("1 + 2") => 3', () => {
  expect(interpretTuff("1 + 2")).toEqual({ ok: true, value: 3 });
});

test('interpretTuff("1 + 2 + 3") => 6', () => {
  expect(interpretTuff("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
});

test('interpretTuff("2 + 3 - 4") => 1', () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
});

test('interpretTuff("2x") => error', () => {
  expect(interpretTuff("2x")).toEqual({
    ok: false,
    error: { kind: "InvalidSyntax", source: "2x" },
  });
});

test('interpretTuff("1.9 + 1") => error', () => {
  expect(interpretTuff("1.9 + 1")).toEqual({
    ok: false,
    error: { kind: "InvalidSyntax", source: "1.9 + 1" },
  });
});

test('interpretTuff("1 + x") => error', () => {
  expect(interpretTuff("1 + x")).toEqual({
    ok: false,
    error: { kind: "InvalidSyntax", source: "1 + x" },
  });
});

test('interpretTuff("") => error', () => {
  expect(interpretTuff("")).toEqual({
    ok: false,
    error: { kind: "InvalidSyntax", source: "" },
  });
});

test('interpretTuff("  3  + 4") => 7', () => {
  expect(interpretTuff("  3  + 4")).toEqual({ ok: true, value: 7 });
});

test('interpretTuff("1 + -2") => -1', () => {
  expect(interpretTuff("1 + -2")).toEqual({ ok: true, value: -1 });
});

test('interpretTuff("1 - -2") => 3', () => {
  expect(interpretTuff("1 - -2")).toEqual({ ok: true, value: 3 });
});
