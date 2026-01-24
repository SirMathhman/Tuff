import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("interpret - char", () => {
  it("supports char literal with single quotes", () => {
    expect(interpret("'a'")).toBe(97);
  });

  it("returns correct UTF-8 code for char 'b'", () => {
    expect(interpret("'b'")).toBe(98);
  });

  it("returns correct UTF-8 code for space character", () => {
    expect(interpret("' '")).toBe(32);
  });

  it("returns correct UTF-8 code for digit character '0'", () => {
    expect(interpret("'0'")).toBe(48);
  });

  it("supports char variable declaration", () => {
    expect(interpret("let x : Char = 'a'; x")).toBe(97);
  });

  it("supports char variable with different character", () => {
    expect(interpret("let x : Char = 'z'; x")).toBe(122);
  });

  it("supports char in expressions", () => {
    expect(interpret("'a' + 1")).toBe(98);
  });

  it("supports char comparison", () => {
    expect(interpret("'a' < 'b'")).toBe(1);
  });

  it("supports char equality comparison", () => {
    expect(interpret("'a' == 'a'")).toBe(1);
  });

  it("supports char inequality comparison", () => {
    expect(interpret("'a' != 'b'")).toBe(1);
  });

  it("throws for empty char literal", () => {
    expect(() => interpret("''")).toThrow();
  });

  it("throws for multi-character literal", () => {
    expect(() => interpret("'ab'")).toThrow();
  });

  it("supports escaped newline character", () => {
    expect(interpret("'\\n'")).toBe(10);
  });

  it("supports escaped tab character", () => {
    expect(interpret("'\\t'")).toBe(9);
  });

  it("supports escaped backslash", () => {
    expect(interpret("'\\\\'")).toBe(92);
  });

  it("supports escaped single quote", () => {
    expect(interpret("'\\''")).toBe(39);
  });
});
