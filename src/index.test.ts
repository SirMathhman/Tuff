import { evaluate } from "./index.js";

describe("evaluate", () => {
  it("returns 0 for an empty string", () => {
    expect(evaluate("")).toBe(0);
  });
  it('returns 1 for "return 1;"', () => {
    expect(evaluate("return 1;")).toBe(1);
  });
  it('returns 1 for "let x = 1; return x;"', () => {
    expect(evaluate("let x = 1; return x;")).toBe(1);
  });
});
