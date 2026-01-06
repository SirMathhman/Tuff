import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenize";
import { isOk, isErr } from "../src/result";

describe("tokenize", () => {
  it("tokenizes simple expression", () => {
    const r = tokenize("1 + 2");
    expect(isOk(r)).toBe(true);
    if (isOk(r))
      expect(r.value).toEqual([
        { type: "num", value: 1 },
        { type: "op", value: "+" },
        { type: "num", value: 2 },
      ]);
  });

  it("handles unary minus", () => {
    const r = tokenize("1 - -2");
    expect(isOk(r)).toBe(true);
    if (isOk(r))
      expect(r.value).toEqual([
        { type: "num", value: 1 },
        { type: "op", value: "-" },
        { type: "num", value: -2 },
      ]);
  });

  it("returns Err on invalid token", () => {
    const r = tokenize("a - 1");
    expect(isErr(r)).toBe(true);
  });
});
