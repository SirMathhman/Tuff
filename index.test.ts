import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('empty string evaluates to 0', () => {
    expect(evaluate("")).toBe(0);
  });
});
