import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpreter";

describe("interpret", () => {
  it("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses integer with unsigned suffix to number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("returns NaN for lowercase u8 suffix", () => {
    expect(Number.isNaN(interpret("100u8"))).toBe(true);
  });

  it("returns NaN for value exceeding U8 range", () => {
    expect(Number.isNaN(interpret("256U8"))).toBe(true);
  });

  it("returns NaN for negative numbers with suffix", () => {
    expect(Number.isNaN(interpret("-100U8"))).toBe(true);
  });

  it("supports various integer suffixes and enforces their ranges", () => {
    // Unsigned
    expect(interpret("255U8")).toBe(255);
    expect(interpret("65535U16")).toBe(65535);
    expect(Number.isNaN(interpret("65536U16"))).toBe(true);
    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(Number.isNaN(interpret("-1U32"))).toBe(true);
    expect(interpret("100U64")).toBe(100);

    // Signed
    expect(interpret("127I8")).toBe(127);
    expect(Number.isNaN(interpret("128I8"))).toBe(true);
    expect(interpret("-128I8")).toBe(-128);
    expect(interpret("32767I16")).toBe(32767);
    expect(Number.isNaN(interpret("32768I16"))).toBe(true);
    expect(interpret("-2147483648I32")).toBe(-2147483648);
    expect(Number.isNaN(interpret("2147483648I32"))).toBe(true);
    expect(interpret("100I64")).toBe(100);
  });
});
