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
it("returns an error for lowercase suffixes", () => {
  expect(interpret("100u8").ok).toBe(false);
});

it("interprets arithmetic with suffixes", () => {
  const result = interpret("1U8 + 2U8");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toBe(3);
  }
});

it("interprets mixed arithmetic with and without suffixes", () => {
  const result1 = interpret("1U8 + 2");
  expect(result1.ok).toBe(true);
  if (result1.ok) {
    expect(result1.value).toBe(3);
  }

  const result2 = interpret("1 + 2U8");
  expect(result2.ok).toBe(true);
  if (result2.ok) {
    expect(result2.value).toBe(3);
  }

  const result3 = interpret("1 + 2U8 + 3");
  expect(result3.ok).toBe(true);
  if (result3.ok) {
    expect(result3.value).toBe(6);
  }
});

it("returns an error for mixed suffixes in arithmetic", () => {
  const result = interpret("1U8 + 2 + 3I8");
  expect(result.ok).toBe(false);
});

it("returns an error if the result overflows the suffix range", () => {
  const result = interpret("1U8 + 255");
  expect(result.ok).toBe(false);
});
