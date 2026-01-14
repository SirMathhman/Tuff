import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret basics", () => {
  it("parses integer string", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses numeric prefix when trailing chars present", () => {
    expect(interpret("100I8")).toBe(100);
  });

  it("throws when unsigned suffix 'U' is present on positive numbers", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("parses negative numeric prefix when trailing chars present", () => {
    expect(interpret("-100I8")).toBe(-100);
  });

  it("throws when negative number has unsigned suffix 'U'", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative integer when input is exactly negative", () => {
    expect(interpret("-100")).toBe(-100);
  });
});

describe("interpret suffixes", () => {
  // Unsigned integer suffixes
  it("parses U8 within range", () => {
    expect(interpret("255U8")).toBe(255);
  });

  it("throws on U8 out of range", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("parses U16 within range", () => {
    expect(interpret("65535U16")).toBe(65535);
  });

  it("parses U32 within range", () => {
    expect(interpret("4294967295U32")).toBe(4294967295);
  });

  // Signed integer suffixes
  it("parses I8 within range", () => {
    expect(interpret("127I8")).toBe(127);
  });

  it("throws on I8 out of range", () => {
    expect(() => interpret("128I8")).toThrow();
  });

  it("parses I16 within range", () => {
    expect(interpret("32767I16")).toBe(32767);
  });

  // Non-integer with suffix should throw
  it("throws on non-integer with suffix", () => {
    expect(() => interpret("1.5U8")).toThrow();
  });
});

describe("interpret addition", () => {
  it("adds two U8 values", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("throws on U8 addition overflow", () => {
    expect(() => interpret("1U8 + 255U8")).toThrow();
  });

  it("throws on U8 + U16 overflow", () => {
    expect(() => interpret("1U8 + 65535U16")).toThrow();
  });

  it("promotes U8 to U16 when adding (1U8 + 255U16 => 256)", () => {
    expect(interpret("1U8 + 255U16")).toBe(256);
  });

  it("throws when adding plain number to overflowing U8", () => {
    expect(() => interpret("1 + 255U8")).toThrow();
  });

  it("adds plain number and U8", () => {
    expect(interpret("1 + 2U8")).toBe(3);
  });

  it("adds U8 and plain number", () => {
    expect(interpret("1U8 + 2")).toBe(3);
  });
});

describe("interpret complex expressions", () => {
  it("adds mixed sequence with promotion (1U8 + 2 + 3U16 => 6)", () => {
    expect(interpret("1U8 + 2 + 3U16")).toBe(6);
  });

  it("evaluates mixed addition and subtraction (4 + 3 - 2 => 5)", () => {
    expect(interpret("4 + 3 - 2")).toBe(5);
  });

  it("handles multiplication with precedence (4 * 3 - 2 => 10)", () => {
    expect(interpret("4 * 3 - 2")).toBe(10);
  });
});
