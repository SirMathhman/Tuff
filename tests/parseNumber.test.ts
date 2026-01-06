import { describe, it, expect } from "vitest";
import { parseNumber } from "../src/parseNumber";

describe("parseNumber", () => {
  it("parses signed decimal", () => {
    const res = parseNumber("-1.5", 0);
    expect(res.value).toBe(-1.5);
    expect(res.nextIndex).toBe(4);
  });

  it("throws on lone sign", () => {
    expect(() => parseNumber("+", 0)).toThrow("Invalid numeric input");
  });

  it("parses sign with spaces", () => {
    const res = parseNumber("- 2", 0);
    expect(res.value).toBe(-2);
    // index should be after the digit
    expect(res.nextIndex).toBe(3);
  });
});
