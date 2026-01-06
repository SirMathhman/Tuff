import { describe, it, expect } from "vitest";
import { parseNumber } from "../src/parseNumber";
import { isOk, isErr } from "../src/result";

describe("parseNumber", () => {
  it("parses signed decimal", () => {
    const res = parseNumber("-1.5", 0);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.value).toBe(-1.5);
      expect(res.value.nextIndex).toBe(4);
    }
  });

  it("returns Err on lone sign", () => {
    const r = parseNumber("+", 0);
    expect(isErr(r)).toBe(true);
  });

  it("parses sign with spaces", () => {
    const res = parseNumber("- 2", 0);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.value).toBe(-2);
      // index should be after the digit
      expect(res.value.nextIndex).toBe(3);
    }
  });

  it("stops at first non-digit character", () => {
    const res = parseNumber("12x3", 0);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) {
      expect(res.value.value).toBe(12);
      expect(res.value.nextIndex).toBe(2);
    }
  });
});
