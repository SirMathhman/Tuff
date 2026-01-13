import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpreter";

describe("interpret", () => {
  it("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses integer with unsigned suffix to number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("returns NaN for lowercase u8 suffix", () => {
    expect(Number.isNaN(interpret("100u8"))).toBe(true);
  });

  it("returns NaN for value exceeding U8 range", () => {
    expect(Number.isNaN(interpret("256U8"))).toBe(true);
  });

  it("returns NaN for negative numbers with suffix", () => {
    expect(Number.isNaN(interpret("-100U8"))).toBe(true);
  });
});
