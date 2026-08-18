import { evaluate } from "./index";

describe("evaluate", () => {
  it("evaluates an empty string to 0", () => {
    expect(evaluate("")).toBe(0);
  });
});
