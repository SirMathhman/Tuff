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
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  it("returns 0 for whitespace-only input", () => {
    expect(evaluate("   ")).toEqual({ ok: true, value: 0 });
  });

  it('returns 1 for the numeric literal "1"', () => {
    expect(evaluate("1")).toEqual({ ok: true, value: 1 });
  });

  it('returns 3.14 for the decimal literal "3.14"', () => {
    expect(evaluate("3.14")).toEqual({ ok: true, value: 3.14 });
  });

  it("returns a structured error for invalid input", () => {
    const result = evaluate("1+1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-literal");
      expect(result.error.source).toBe("1+1");
      expect(result.error.offset).toBe(0);
      expect(result.error.message).toContain("not a valid numeric literal");
    }
  });
});
