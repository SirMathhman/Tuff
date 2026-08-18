import { describe, expect, test } from "bun:test";
import { evaluate } from "../src/index.ts";

describe("evaluate", () => {
  test('evaluate("") => 0', () => {
    const result = evaluate("");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test('evaluate("1") => 1', () => {
    const result = evaluate("1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
  });
});
