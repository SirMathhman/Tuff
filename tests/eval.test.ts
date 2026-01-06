import { describe, it, expect } from "vitest";
import { evalLeftToRight } from "../src/evalLeftToRight";
import { isOk, isErr } from "../src/result";

describe("evalLeftToRight", () => {
  it("evaluates left-to-right", () => {
    const tokens = [
      { type: "num", value: 10 } as const,
      { type: "op", value: "-" } as const,
      { type: "num", value: 5 } as const,
      { type: "op", value: "+" } as const,
      { type: "num", value: 3 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(8);
  });

  it("returns Err on invalid token sequence", () => {
    const r = evalLeftToRight([{ type: "op", value: "+" } as any]);
    expect(isErr(r)).toBe(true);
  });
});
