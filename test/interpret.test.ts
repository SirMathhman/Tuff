import { describe, it, expect } from "bun:test";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("is a function that returns a string", () => {
    const out = interpret("hello");
    expect(typeof out).toBe("string");
  });

  it("returns the same string for simple inputs (identity)", () => {
    expect(interpret("100")).toBe("100");
  });
});
