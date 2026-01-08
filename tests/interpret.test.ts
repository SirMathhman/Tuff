import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (basic behavior)", () => {
  it("returns a number for any input", () => {
    const result = interpret("anything");
    expect(typeof result).toBe("number");
  });

  it("parses numeric strings and returns 0 for non-numeric strings", () => {
    expect(interpret("")).toBe(0);
    expect(interpret("42")).toBe(42);
    expect(interpret("hello world")).toBe(0);
  });

  it("handles the user-provided case '100' => 100", () => {
    expect(interpret("100")).toBe(100);
  });

  it("handles suffixes like 'U8' (e.g., '100U8' => 100)", () => {
    expect(interpret("100U8")).toBe(100);
    expect(interpret("100u8")).toBe(100);
  });

  it("throws for out-of-range unsigned values (e.g., '256U8')", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("accepts max unsigned values (e.g., '255U8' => 255)", () => {
    expect(interpret("255U8")).toBe(255);
    expect(interpret("0U8")).toBe(0);
  });

  it("handles U16, U32 boundaries", () => {
    expect(interpret("65535U16")).toBe(65535);
    expect(() => interpret("65536U16")).toThrow();

    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(() => interpret("4294967296U32")).toThrow();
  });

  it("handles U64 boundaries (accepts in-range, throws out-of-range)", () => {
    // 2^64-1 = 18446744073709551615
    expect(typeof interpret("18446744073709551615U64")).toBe("number");
    expect(() => interpret("18446744073709551616U64")).toThrow();
  });

  it("handles signed I8/I16/I32 boundaries", () => {
    expect(interpret("-128I8")).toBe(-128);
    expect(() => interpret("-129I8")).toThrow();
    expect(interpret("127I8")).toBe(127);
    expect(() => interpret("128I8")).toThrow();

    expect(interpret("-32768I16")).toBe(-32768);
    expect(() => interpret("-32769I16")).toThrow();
    expect(interpret("32767I16")).toBe(32767);
    expect(() => interpret("32768I16")).toThrow();

    expect(interpret("-2147483648I32")).toBe(-2147483648);
    expect(() => interpret("-2147483649I32")).toThrow();
    expect(interpret("2147483647I32")).toBe(2147483647);
    expect(() => interpret("2147483648I32")).toThrow();
  });

  it("handles I64 boundaries (accepts in-range, throws out-of-range)", () => {
    // min = -2^63 = -9223372036854775808
    expect(typeof interpret("-9223372036854775808I64")).toBe("number");
    expect(() => interpret("-9223372036854775809I64")).toThrow();
  });

  it("throws for negative numbers with suffixes (e.g., '-100U8')", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative numbers without suffixes (e.g., '-100' => -100)", () => {
    expect(interpret("-100")).toBe(-100);
  });

  it("evaluates simple addition of suffixed integers (e.g., '1U8 + 2U8' => 3)", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });
});
