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

  it("throws for negative numbers with suffixes (e.g., '-100U8')", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative numbers without suffixes (e.g., '-100' => -100)", () => {
    expect(interpret("-100")).toBe(-100);
  });
});
