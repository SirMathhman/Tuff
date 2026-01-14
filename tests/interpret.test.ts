import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("parses integer string", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses numeric prefix when trailing chars present", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("parses negative numeric prefix when trailing chars present", () => {
    expect(interpret("-100I8")).toBe(-100);
  });

  it("throws when negative number has unsigned suffix 'U'", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative integer when input is exactly negative", () => {
    expect(interpret("-100")).toBe(-100);
  });
});
