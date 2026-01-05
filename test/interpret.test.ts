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
});
