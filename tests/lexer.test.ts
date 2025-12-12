import { describe, expect, test } from "bun:test";
import { Lexer } from "../src/lexer";

describe("lexer", () => {
  test("supports nested block comments", () => {
    const src = `let x = 1; /* outer /* inner */ still outer */ let y = 2;`;
    const toks = new Lexer("/virtual/test.tuff", src).tokenize();
    const texts = toks
      .filter((t) => t.kind !== "newline" && t.kind !== "eof")
      .map((t) => t.text);
    expect(texts).toEqual([
      "let",
      "x",
      "=",
      "1",
      ";",
      "let",
      "y",
      "=",
      "2",
      ";",
    ]);
  });

  test("treats newlines as tokens", () => {
    const src = `let x = 1\nlet y = 2`;
    const toks = new Lexer("/virtual/test.tuff", src).tokenize();
    expect(toks.some((t) => t.kind === "newline")).toBe(true);
  });
});
