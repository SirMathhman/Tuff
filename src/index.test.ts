import { describe, it, expect } from "vitest";
import { interpret } from "./index";

describe("interpret", () => {
  it("should return a number", () => {
    const result = interpret("123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe("number");
    }
  });

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
      expect(result.error).toBe("Unsigned integer cannot be negative");
    }
  });

  it('should return error for "256U8"', () => {
    const result = interpret("256U8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Value 256 is out of range for U8");
    }
  });
});
