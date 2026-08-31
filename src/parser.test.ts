import { test, expect } from "bun:test";
import { parse } from "./parser.ts";
import type { Token } from "./lexer.ts";

test("parse single number token", () => {
  const tokens: Token[] = [
    { type: "number", value: 12, position: 0 },
    { type: "end", position: 2 },
  ];
  expect(parse(tokens)).toEqual({
    ok: true,
    ast: { type: "number", value: 12 },
  });
});

test("parse empty tokens => error", () => {
  expect(parse([])).toEqual({
    ok: false,
    error: { kind: "syntax", message: "expected a number", position: 0 },
  });
});

test("parse two numbers => error", () => {
  const tokens: Token[] = [
    { type: "number", value: 1, position: 0 },
    { type: "number", value: 2, position: 2 },
    { type: "end", position: 3 },
  ];
  expect(parse(tokens)).toEqual({
    ok: false,
    error: { kind: "syntax", message: "expected end of input", position: 2 },
  });
});
