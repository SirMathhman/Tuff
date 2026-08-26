import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff", () => {
  test('evaluateTuff("") => 0', () => {
    expect(evaluateTuff("")).toBe(0);
  });

  test('evaluateTuff("return 1;") => 1', () => {
    expect(evaluateTuff("return 1;")).toBe(1);
  });
});
