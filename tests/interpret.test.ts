import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("is a function", () => {
    expect(typeof interpret).toBe("function");
  });

  it("parses integer numeric string", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses a simple addition expression", () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  it("parses chained addition expressions", () => {
    expect(interpret("1+2+3")).toBe(6);
  });

  it("parses spaced chained addition expressions", () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  it("parses subtraction", () => {
    expect(interpret("10 - 5")).toBe(5);
  });

  it("parses mixed left-to-right expressions", () => {
    expect(interpret("10 - 5 + 3")).toBe(8);
    expect(interpret("1 + 2 - 3")).toBe(0);
    expect(interpret("1 - 2 - 3")).toBe(-4);
  });

  it("handles decimals and negatives", () => {
    expect(interpret("-1 + 2.5")).toBe(1.5);
  });

  it("supports unary minus after operator", () => {
    expect(interpret("1 - -2")).toBe(3);
  });

  it("throws on invalid tokens", () => {
    expect(() => interpret("a - 1")).toThrow("Invalid numeric input");
  });
});
