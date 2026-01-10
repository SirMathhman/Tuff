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
  
  // U16 tests
  it('should interpret "1000U16" as 1000', () => {
    const result = interpret("1000U16");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1000);
    }
  });
  it('should return error for "65536U16"', () => {
    const result = interpret("65536U16");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("U16");
    }
  });

  // U32 tests
  it('should interpret "100000U32" as 100000', () => {
    const result = interpret("100000U32");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(100000);
    }
  });

  // U64 tests
  it('should interpret "1000000U64" as 1000000', () => {
    const result = interpret("1000000U64");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1000000);
    }
  });

  // I8 tests
  it('should interpret "-100I8" as -100', () => {
    const result = interpret("-100I8");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-100);
    }
  });
  it('should return error for "200I8"', () => {
    const result = interpret("200I8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("I8");
    }
  });
  it('should return error for "-200I8"', () => {
    const result = interpret("-200I8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("I8");
    }
  });

  // I16 tests
  it('should interpret "-1000I16" as -1000', () => {
    const result = interpret("-1000I16");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-1000);
    }
  });
  it('should return error for "50000I16"', () => {
    const result = interpret("50000I16");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("I16");
    }
  });

  // I32 tests
  it('should interpret "-100000I32" as -100000', () => {
    const result = interpret("-100000I32");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-100000);
    }
  });

  // I64 tests
  it('should interpret "-1000000I64" as -1000000', () => {
    const result = interpret("-1000000I64");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-1000000);
    }
  });

  // Unknown type test
  it('should return error for unknown type "U128"', () => {
    const result = interpret("100U128");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown type");
    }
  });
});
