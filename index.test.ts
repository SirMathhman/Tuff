import { describe, test, expect } from "bun:test";
import { interpret } from "./index";

describe("interpret", () => {
  test('interpret("") returns 0', () => {
    expect(interpret("")).toBe(0);
  });

  test('interpret("1") returns 1', () => {
    expect(interpret("1")).toBe(1);
  });
});
