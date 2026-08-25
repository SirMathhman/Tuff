import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff", () => {
  test("empty string returns 0", () => {
    expect(evaluateTuff("")).toBe(0);
  });

  test('return statement returns the number', () => {
    expect(evaluateTuff("return 1;")).toBe(1);
  });
});
