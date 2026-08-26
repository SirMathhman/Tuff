import { describe, expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";

describe("evaluateTuff", () => {
  test('evaluateTuff("") => 0', () => {
    expect(evaluateTuff("")).toBe(0);
  });
});
