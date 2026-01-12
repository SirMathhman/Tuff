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
