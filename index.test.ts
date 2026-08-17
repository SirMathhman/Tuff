import { evaluateTuff } from "./index";

describe("evaluateTuff", () => {
  it("returns 0 for empty string", () => {
    expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
  });

  it("returns an error for invalid input", () => {
    const result = evaluateTuff("something invalid");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
