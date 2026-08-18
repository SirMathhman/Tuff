import { evaluate } from "./index.js";

describe("evaluate", () => {
  it("returns 0 for empty string", () => {
    expect(evaluate("")).toBe(0);
  });

  it("returns 1 for the numeric literal 1", () => {
    expect(evaluate("1")).toBe(1);
  });
});
