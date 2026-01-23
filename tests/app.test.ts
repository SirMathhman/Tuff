import { describe, it, expect } from "bun:test";
import { interpret } from "../src/app";

describe("interpret", () => {
  it("returns 0 for empty string", () => {
    expect(interpret("")).toBe(0);
  });

  it("parses a number string and returns the number", () => {
    expect(interpret("100")).toBe(100);
  });
});
