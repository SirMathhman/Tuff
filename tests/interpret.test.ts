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
});
