import { describe, it } from "bun:test";
import { assertInterpretInvalid, assertInterpretValid } from "../test-helpers";

describe("interpret - strings - basic", () => {
  it("supports string length property", () => {
    assertInterpretValid('"hello".length', 5);
  });

  it("supports string length for empty string", () => {
    assertInterpretValid('"".length', 0);
  });

  it("supports string length on variable", () => {
    assertInterpretValid('let x : Str = "test"; x.length', 4);
  });

  it("supports string pointer length property", () => {
    assertInterpretValid('let x : *Str = "test"; x.length', 4);
  });
});

describe("interpret - strings - escaping", () => {
  it("supports string with escaped characters", () => {
    assertInterpretValid('"hello\\nworld".length', 11);
  });

  it("supports string with escaped tab", () => {
    assertInterpretValid('"tab\\there".length', 8);
  });

  it("supports string with escaped quotes", () => {
    const code = String.raw`"hello world".length`;
    assertInterpretValid(code, 11);
  });

  it("supports string with escaped backslash", () => {
    assertInterpretValid('"path\\\\to\\\\file".length', 12);
  });

  it("supports multiple strings in expression", () => {
    assertInterpretValid('"a".length + "bb".length', 3);
  });

  it("supports string in variable and length access", () => {
    assertInterpretValid(
      'let msg : Str = "message"; let len = msg.length; len',
      7,
    );
  });
});

describe("interpret - strings - indexing", () => {
  it("supports string indexing with literals", () => {
    assertInterpretValid('"test"[0]', 116); // 't'
  });

  it("supports string indexing at different positions", () => {
    assertInterpretValid('"test"[1]', 101); // 'e'
  });

  it("supports string indexing last character", () => {
    assertInterpretValid('"test"[3]', 116); // 't'
  });

  it("supports string indexing on variable", () => {
    assertInterpretValid('let x : Str = "hello"; x[0]', 104); // 'h'
  });

  it("supports string indexing on pointer", () => {
    assertInterpretValid('let x : *Str = "test"; x[0]', 116); // 't'
  });

  it("supports string indexing with expression index", () => {
    assertInterpretValid('"test"[1 + 1]', 115); // 's'
  });

  it("supports string indexing space character", () => {
    assertInterpretValid('"a b"[1]', 32); // ' '
  });

  it("supports string indexing with escaped characters", () => {
    assertInterpretValid('"a\\nb"[1]', 10); // '\n'
  });

  it("throws for string index out of bounds", () => {
    assertInterpretInvalid('"test"[4]');
  });

  it("throws for string index negative", () => {
    assertInterpretInvalid('"test"[-1]');
  });
});
