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

  it("returns 6 for the expression 1 + 2 + 3", () => {
    expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
  });

  it("returns 1 for the expression 2 + 3 - 4", () => {
    expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
  });

  it("returns 10 for the expression 2 * 3 + 4", () => {
    expect(evaluate("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
  });

  it("returns 14 for the expression 2 + 3 * 4", () => {
    expect(evaluate("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
  });

  it("returns 20 for the expression (2 + 3) * 4", () => {
    expect(evaluate("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
  });

  it("returns 20 for the expression { 2 + 3 } * 4", () => {
    expect(evaluate("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
  });

  it("returns 20 for the expression { let x = 2 + 3; x } * 4", () => {
    expect(evaluate("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
  });

  it("returns a structured error for unsupported expressions", () => {
    const result = evaluate("1 +");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.kind).toBe("unexpected_token");
      expect(result.error.input).toBe("1 +");
      expect(result.error.position).toEqual({ line: 1, column: 4 });
    }
  });

  it("reports the source position of an unexpected character", () => {
    const result = evaluate("1 + $");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.kind).toBe("unexpected_character");

      if (result.error.kind === "unexpected_character") {
        expect(result.error.character).toBe("$");
        expect(result.error.position).toEqual({ line: 1, column: 5 });
      }
    }
  });

  it("returns a structured error for undefined variables", () => {
    const result = evaluate("1 + x");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.kind).toBe("undefined_variable");

      if (result.error.kind === "undefined_variable") {
        expect(result.error.name).toBe("x");
        expect(result.error.position).toEqual({ line: 1, column: 5 });
      }
    }
  });
});
