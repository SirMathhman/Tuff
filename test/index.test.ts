import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "../src/index.ts";

describe("evaluateTuff", () => {
  test("empty source evaluates to 0", () => {
    expect(evaluateTuff("")).toBe(0);
  });

  test('numeric source "1" evaluates to 1', () => {
    expect(evaluateTuff("1")).toBe(1);
  });
});
