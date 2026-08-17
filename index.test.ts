import { evaluateTuff } from "./index";

describe("evaluateTuff", () => {
  it('returns 0 for empty string', () => {
    expect(evaluateTuff("")).toBe(0);
  });
});
