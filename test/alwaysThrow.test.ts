import { describe, it, expect } from "bun:test";
import { alwaysThrow } from "../src/alwaysThrow";

describe("alwaysThrow", () => {
  it("returns the provided message", () => {
    expect(alwaysThrow("boom")).toBe("boom");
  });

  it('returns the provided string "100"', () => {
    expect(alwaysThrow("100")).toBe("100");
  });
});
