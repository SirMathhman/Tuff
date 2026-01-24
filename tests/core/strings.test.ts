import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("interpret - strings", () => {
  it("supports string literal with double quotes", () => {
    expect(interpret('"test"')).toBeGreaterThanOrEqual(1000000);
  });

  it("supports string variable declaration", () => {
    expect(interpret('let x : Str = "hello"; x')).toBeGreaterThanOrEqual(
      1000000,
    );
  });

  it("supports string length property", () => {
    expect(interpret('"hello".length')).toBe(5);
  });

  it("supports string length for empty string", () => {
    expect(interpret('"".length')).toBe(0);
  });

  it("supports string length on variable", () => {
    expect(interpret('let x : Str = "test"; x.length')).toBe(4);
  });

  it("supports string pointer type", () => {
    expect(interpret('let x : *Str = "test"; x')).toBeGreaterThanOrEqual(
      1000000,
    );
  });

  it("supports string pointer length property", () => {
    expect(interpret('let x : *Str = "test"; x.length')).toBe(4);
  });

  it("supports string with escaped characters", () => {
    expect(interpret('"hello\\nworld".length')).toBe(11);
  });

  it("supports string with escaped tab", () => {
    expect(interpret('"tab\\there".length')).toBe(8);
  });

  it("supports string with escaped quotes", () => {
    const code = String.raw`"hello world".length`;
    expect(interpret(code)).toBe(11);
  });

  it("supports string with escaped backslash", () => {
    expect(interpret('"path\\\\to\\\\file".length')).toBe(12);
  });

  it("supports multiple strings in expression", () => {
    expect(interpret('"a".length + "bb".length')).toBe(3);
  });

  it("supports string in variable and length access", () => {
    expect(
      interpret('let msg : Str = "message"; let len = msg.length; len'),
    ).toBe(7);
  });

  it("supports string indexing with literals", () => {
    expect(interpret('"test"[0]')).toBe(116); // 't'
  });

  it("supports string indexing at different positions", () => {
    expect(interpret('"test"[1]')).toBe(101); // 'e'
  });

  it("supports string indexing last character", () => {
    expect(interpret('"test"[3]')).toBe(116); // 't'
  });

  it("supports string indexing on variable", () => {
    expect(interpret('let x : Str = "hello"; x[0]')).toBe(104); // 'h'
  });

  it("supports string indexing on pointer", () => {
    expect(interpret('let x : *Str = "test"; x[0]')).toBe(116); // 't'
  });

  it("supports string indexing with expression index", () => {
    expect(interpret('"test"[1 + 1]')).toBe(115); // 's'
  });

  it("supports string indexing space character", () => {
    expect(interpret('"a b"[1]')).toBe(32); // ' '
  });

  it("supports string indexing with escaped characters", () => {
    expect(interpret('"a\\nb"[1]')).toBe(10); // '\n'
  });

  it("throws for string index out of bounds", () => {
    expect(() => interpret('"test"[4]')).toThrow();
  });

  it("throws for string index negative", () => {
    expect(() => interpret('"test"[-1]')).toThrow();
  });
});
