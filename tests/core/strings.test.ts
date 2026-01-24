import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("interpret - strings", () => {
  it("supports string literal with double quotes", () => {
    expect(interpret('"test"')).toBeGreaterThanOrEqual(1000000);
  });

  it("supports string variable declaration", () => {
    expect(
      interpret('let x : Str = "hello"; x'),
    ).toBeGreaterThanOrEqual(1000000);
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
    expect(
      interpret('let x : *Str = "test"; x'),
    ).toBeGreaterThanOrEqual(1000000);
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
});
