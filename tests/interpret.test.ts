import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("returns a number", () => {
    const result = interpret("hello");
    expect(typeof result).toBe("number");
  });

  it("returns the length of the input string", () => {
    expect(interpret("hello")).toBe(5);
    expect(interpret("")).toBe(0);
  });
  it("parses numeric strings to numbers", () => {
    expect(interpret("100")).toBe(100);
    expect(interpret("  3.14  ")).toBe(3.14);
    expect(interpret("-2")).toBe(-2);
  });
});
