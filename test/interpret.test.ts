import { describe, it, expect } from "bun:test";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("is a function that returns a string", () => {
    const out = interpret("hello");
    expect(typeof out).toBe("string");
  });

  it("returns an empty string for now (stub)", () => {
    expect(interpret("anything")).toBe("");
  });
});
