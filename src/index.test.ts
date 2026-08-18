import { evaluate } from "./index.js";

describe("evaluate", () => {
  it("evaluates an empty string to 0", () => {
    expect(evaluate("")).toBe(0);
  });

  it('evaluates "1" to 1', () => {
    expect(evaluate("1")).toBe(1);
  });
});
