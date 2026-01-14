import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("parses integer string", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses numeric prefix when trailing chars present", () => {
    expect(interpret("100U8")).toBe(100);
  });

	it("throws on negative numeric prefix", () => {
		expect(() => interpret("-100U8")).toThrow();
	});
});
