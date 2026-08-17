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

  it('returns 6 for "1 + 2 + 3"', () => {
    expect(evaluateTuff("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
  });

  it('returns 1 for "2 + 3 - 4"', () => {
    expect(evaluateTuff("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
  });

  it('returns 10 for "2 * 3 + 4"', () => {
    expect(evaluateTuff("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
  });

  it('returns 14 for "2 + 3 * 4"', () => {
    expect(evaluateTuff("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
  });

  it("returns an error for invalid input", () => {
    const result = evaluateTuff("something invalid");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error for an unexpected character", () => {
    const result = evaluateTuff("1 $ 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when a number is missing after an operator", () => {
    const result = evaluateTuff("1 +");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when a number is missing after *", () => {
    const result = evaluateTuff("1 *");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
