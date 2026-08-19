import { evaluate } from "./index.js";

describe("evaluate", () => {
  it('returns 0 for an empty string', () => {
    expect(evaluate("")).toBe(0);
  });
});
