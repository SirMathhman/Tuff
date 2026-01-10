import { describe, it, expect } from "vitest";
import { interpret } from "./interpret";

describe("interpret", () => {
  it('should interpret "100" as 100', () => {
    const result = interpret("100");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(100);
    }
  });
  it('should interpret "100U8" as 100', () => {
    const result = interpret("100U8");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(100);
    }
  });
  it('should return error for "-100U8"', () => {
    const result = interpret("-100U8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("negative numbers");
    }
  });
  it('should return error for "256U8"', () => {
    const result = interpret("256U8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("U8");
    }
  });
});
