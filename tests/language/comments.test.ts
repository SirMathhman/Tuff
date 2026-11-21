import { expect, test } from "bun:test";
import { interpretTuff } from "../../index";

test('interpretTuff("// a comment") => 0', () => {
  expect(interpretTuff("// a comment")).toEqual({ ok: true, value: 0 });
});

test("a line comment after an expression is ignored", () => {
  expect(interpretTuff("1 + 1 // add one more\n")).toEqual({ ok: true, value: 2 });
});

test('interpretTuff("/* a longer comment */") => 0', () => {
  expect(interpretTuff("/* a longer comment */")).toEqual({ ok: true, value: 0 });
});

test("a block comment between tokens is ignored", () => {
  expect(interpretTuff("1 /* plus */ + /* one */ 1")).toEqual({ ok: true, value: 2 });
});
