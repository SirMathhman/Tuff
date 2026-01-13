import { it, expect } from "vitest";
import { interpret } from "../src/interpreter";

it("interprets a numeric literal", () => {
  const result = interpret("100");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toBe(100);
  }
});

it("interprets a numeric literal with U8 suffix", () => {
  const result = interpret("100U8");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toBe(100);
  }
});

it("returns an error for negative numeric literal with U8 suffix", () => {
  const result = interpret("-100U8");
  expect(result.ok).toBe(false);
});

it("returns an error for U8 literal > 255", () => {
  const result = interpret("256U8");
  expect(result.ok).toBe(false);
});

it("interprets signed and unsigned suffixes correctly", () => {
  expect(interpret("127I8").ok).toBe(true);
  expect(interpret("-128I8").ok).toBe(true);
  expect(interpret("128I8").ok).toBe(false);
  expect(interpret("-129I8").ok).toBe(false);
  
  expect(interpret("65535U16").ok).toBe(true);
  expect(interpret("65536U16").ok).toBe(false);
  
  expect(interpret("2147483647I32").ok).toBe(true);
  expect(interpret("-2147483648I32").ok).toBe(true);
});
