import { describe, expect, it } from "bun:test";
import { evaluate } from "./index";

describe("evalute", () => {
  it('evalute("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });
});
