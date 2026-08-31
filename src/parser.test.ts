import { expect, test } from "bun:test";
import type { Token } from "./lexer.ts";
import { parse } from "./parser.ts";

test("parse single number token", () => {
  const tokens: Token[] = [
    { type: "number", value: 12, position: 0 },
    { type: "end", position: 2 },
  ];
  expect(parse(tokens)).toEqual({
    ok: true,
    ast: { type: "number", value: 12, position: 0 },
  });
});

test("parse empty tokens => error", () => {
  expect(parse([])).toEqual({
    ok: false,
    error: { kind: "syntax", message: "expected a number", position: 0 },
  });
});

test("parse only end token => number 0", () => {
  const tokens: Token[] = [{ type: "end", position: 0 }];
  expect(parse(tokens)).toEqual({
    ok: true,
    ast: { type: "number", value: 0, position: 0 },
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

test("parse addition", () => {
  const tokens: Token[] = [
    { type: "number", value: 1, position: 0 },
    { type: "plus", position: 2 },
    { type: "number", value: 2, position: 4 },
    { type: "end", position: 5 },
  ];
  expect(parse(tokens)).toEqual({
    ok: true,
    ast: {
      type: "add",
      left: { type: "number", value: 1, position: 0 },
      right: { type: "number", value: 2, position: 4 },
      position: 2,
    },
  });
});
