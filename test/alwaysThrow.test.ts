import { describe, it, expect } from "bun:test";
import { alwaysThrow } from "../src/alwaysThrow";

describe("alwaysThrow", () => {
  it("throws when called with 'boom'", () => {
    expect(() => alwaysThrow("boom")).toThrow();
  });

  it('returns the provided string "100"', () => {
    expect(alwaysThrow("100")).toBe("100");
  });
});
