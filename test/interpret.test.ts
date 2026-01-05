/* eslint-env vitest */
import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("parses numeric strings", () => {
    expect(interpret("100")).toBe(100);
  });

  it("adds simple expressions", () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  it("adds multiple terms", () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  it("handles mixed addition and subtraction", () => {
    expect(interpret("10 - 5 + 3")).toBe(8);
  });

  it("supports multiplication with precedence", () => {
    expect(interpret("10 * 5 + 3")).toBe(53);
  });

  it("handles multiplication without space after operator", () => {
    expect(interpret("3 +10 * 5")).toBe(53);
  });

  it("supports parentheses with precedence", () => {
    expect(interpret("(3 + 10) * 5")).toBe(65);
  });

  it("returns NaN for malformed leading operator", () => {
    expect(interpret("+ 1")).toBeNaN();
  });

  it("returns NaN for unknown operator", () => {
    expect(interpret("1 ^ 2")).toBeNaN();
  });

  it("returns NaN for non-numeric strings", () => {
    expect(interpret("foo")).toBeNaN();
  });
});
