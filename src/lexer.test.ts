import { test, expect } from "bun:test";
import { lex } from "./lexer.ts";

test('lex(" 1 ") => number token at position 1', () => {
  expect(lex(" 1 ")).toEqual({
    ok: true,
    tokens: [
      { type: "number", value: 1, position: 1 },
      { type: "end", position: 3 },
    ],
  });
});
