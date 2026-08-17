import { evaluateTuff } from "./index";

describe("evaluateTuff", () => {
  it("returns 0 for empty string", () => {
    expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
  });

  it('returns 1 for "1"', () => {
    expect(evaluateTuff("1")).toEqual({ ok: true, value: 1 });
  });

  it('returns 3 for "1 + 2"', () => {
    expect(evaluateTuff("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  it("returns an error for invalid input", () => {
    const result = evaluateTuff("something invalid");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
