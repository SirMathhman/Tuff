import { describe, it, expect } from "bun:test";
import { handleMessage } from "../src/handleMessage";

describe("handleMessage", () => {
  it("throws when called with 'boom'", () => {
    expect(() => handleMessage("boom")).toThrow();
  });

  it('returns the provided string "100"', () => {
    expect(handleMessage("100")).toBe("100");
  });
});
