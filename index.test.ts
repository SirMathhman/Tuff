import { describe, test, expect } from "bun:test";
import { interpret } from "./index";

describe("interpret", () => {
  test('interpret("") returns 0', () => {
    expect(interpret("")).toBe(0);
  });

  test('interpret("1") returns 1', () => {
    expect(interpret("1")).toBe(1);
  });

  test('interpret("1 + 2") returns 3', () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  test('interpret("2 + 3 - 4") returns 1', () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });
});
