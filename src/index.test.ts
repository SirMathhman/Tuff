import { evaluate } from "./index.js";

describe("evaluate", () => {
  it("returns 0 for empty string", () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  it("returns 1 for the numeric literal 1", () => {
    expect(evaluate("1")).toEqual({ ok: true, value: 1 });
  });

  it("returns 3 for the expression 1 + 2", () => {
    expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  it("returns a structured error for unsupported expressions", () => {
    const result = evaluate("1 +");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.kind).toBe("unsupported_expression");
      expect(result.error.input).toBe("1 +");
    }
  });
});
