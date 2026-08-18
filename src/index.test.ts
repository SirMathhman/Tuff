import { add, evaluate } from "./index.js";

describe("add", () => {
  it("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });

  it("handles negative numbers", () => {
    expect(add(-1, 1)).toBe(0);
  });
});

describe("evaluate", () => {
  it("returns 0 for empty input", () => {
    expect(evaluate("")).toBe(0);
  });
});
