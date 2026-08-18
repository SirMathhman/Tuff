import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "../src/index.ts";

describe("evaluateTuff", () => {
  test('empty source evaluates to 0', () => {
    expect(evaluateTuff("")).toBe(0);
  });
});
