import { describe, it, expect } from "bun:test";
import { intepret } from "../src/intepret";
import { isOk } from "../src/result";

describe("intepret", () => {
  it("returns ok(0) for empty string", () => {
    const result = intepret("");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("parses integer strings like '100'", () => {
    const result = intepret("100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("parses numeric strings with type suffixes like '100U8'", () => {
    const result = intepret("100U8");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("returns err for negative numbers with suffixes like '-100U8'", () => {
    const result = intepret("-100U8");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error).toContain("Negative");
  });
});
