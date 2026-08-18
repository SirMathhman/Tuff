import { evaluate } from "./index.js";

describe("evaluate", () => {
  it("returns 0 for an empty string", () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  it('returns 1 for the input "1"', () => {
    expect(evaluate("1")).toEqual({ ok: true, value: 1 });
  });

  it('returns 3 for the input "1 + 2"', () => {
    expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  it("returns the parsed number for valid numeric input", () => {
    expect(evaluate("42")).toEqual({ ok: true, value: 42 });
  });

  it("returns a structured error for invalid input", () => {
    expect(evaluate("abc")).toEqual({
      ok: false,
      error: {
        kind: "invalid-number",
        input: "abc",
        reason: 'Cannot parse "abc" as a number',
      },
    });
  });
});
