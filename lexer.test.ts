import { describe, expect, test } from "bun:test";
import { tokenize } from "./lexer.ts";

describe("tokenize", () => {
  test('tokenize("") => []', () => {
    expect(tokenize("")).toEqual([]);
  });

  test('tokenize("1 + 2") => number, plus, number', () => {
    expect(tokenize("1 + 2")).toEqual([
      { value: "1", index: 0 },
      { value: "+", index: 2 },
      { value: "2", index: 4 },
    ]);
  });

  test('tokenize("let x = 2.5; x") => identifiers, number, and punctuation', () => {
    expect(tokenize("let x = 2.5; x")).toEqual([
      { value: "let", index: 0 },
      { value: "x", index: 4 },
      { value: "=", index: 6 },
      { value: "2.5", index: 8 },
      { value: ";", index: 11 },
      { value: "x", index: 13 },
    ]);
  });

  test("tokenize skips whitespace", () => {
    expect(tokenize("  1\t+  2  ")).toEqual([
      { value: "1", index: 2 },
      { value: "+", index: 4 },
      { value: "2", index: 7 },
    ]);
  });

  test("tokenize emits unknown characters as single-char tokens", () => {
    expect(tokenize("1 @ 2")).toEqual([
      { value: "1", index: 0 },
      { value: "@", index: 2 },
      { value: "2", index: 4 },
    ]);
  });
});
