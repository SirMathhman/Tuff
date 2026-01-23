import { describe, it, expect } from "bun:test";
import { interpret } from "../src/app";

describe("interpret", () => {
  it("returns 0 for empty string", () => {
    expect(interpret("")).toBe(0);
  });

  it("parses a number string and returns the number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses a number with a type suffix and returns the number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("throws for negative value with unsigned suffix", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("throws for overflow with unsigned suffix U8", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("parses simple addition with typed literals", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("throws on overflow when adding two U8 values", () => {
    expect(() => interpret("1U8 + 255U8")).toThrow();
  });
});
