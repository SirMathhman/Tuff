import { describe, it, expect } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  it('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });
});
