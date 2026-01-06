import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("is a function", () => {
    expect(typeof interpret).toBe("function");
  });

  it("throws Not implemented error when called", () => {
    expect(() => interpret("any input")).toThrow("Not implemented");
  });
});
