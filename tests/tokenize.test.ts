import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenize";

describe("tokenize", () => {
  it("tokenizes simple expression", () => {
    expect(tokenize("1 + 2")).toEqual([
      { type: "num", value: 1 },
      { type: "op", value: "+" },
      { type: "num", value: 2 },
    ]);
  });

  it("handles unary minus", () => {
    expect(tokenize("1 - -2")).toEqual([
      { type: "num", value: 1 },
      { type: "op", value: "-" },
      { type: "num", value: -2 },
    ]);
  });

  it("throws on invalid token", () => {
    expect(() => tokenize("a - 1")).toThrow("Invalid numeric input");
  });
});
