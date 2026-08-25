import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff", () => {
  test('empty string returns 0', () => {
    expect(evaluateTuff("")).toBe(0);
  });
});
