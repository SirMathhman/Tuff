import { evaluate } from "./index";

describe("evaluate", () => {
  it('returns 0 for empty string', () => {
    expect(evaluate("")).toBe(0);
  });
});
