import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  test('evaluate("") returns 0', () => {
    expect(evaluate("")).toBe(0);
  });
});
