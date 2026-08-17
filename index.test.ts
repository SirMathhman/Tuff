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

  it('returns 20 for "(2 + 3) * 4"', () => {
    expect(evaluateTuff("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
  });

  it('returns 20 for "{ 2 + 3 } * 4"', () => {
    expect(evaluateTuff("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
  });

  it('returns 20 for "{ let x = 2 + 3; x } * 4"', () => {
    expect(evaluateTuff("{ let x = 2 + 3; x } * 4")).toEqual({
      ok: true,
      value: 20,
    });
  });

  it('returns 20 for "let y = { let x = 2 + 3; x } * 4; y"', () => {
    expect(evaluateTuff("let y = { let x = 2 + 3; x } * 4; y")).toEqual({
      ok: true,
      value: 20,
    });
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

  it("returns an error when a closing parenthesis is missing", () => {
    const result = evaluateTuff("(2 + 3");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when the expression inside parentheses is invalid", () => {
    const result = evaluateTuff("(1 +)");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error for an empty block", () => {
    const result = evaluateTuff("{ }");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when a closing brace is missing", () => {
    const result = evaluateTuff("{ let x = 1; x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error for an unknown identifier", () => {
    const result = evaluateTuff("y");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when '=' is missing after a let binding", () => {
    const result = evaluateTuff("{ let x 1; x }");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when ';' is missing after a let binding", () => {
    const result = evaluateTuff("{ let x = 1 }");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when the let binding has no identifier", () => {
    const result = evaluateTuff("{ let = 1; }");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("returns an error when the let binding value is invalid", () => {
    const result = evaluateTuff("{ let x = 1 +; }");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("evaluates a block with multiple statements separated by ';'", () => {
    expect(evaluateTuff("{ 1; 2 }")).toEqual({ ok: true, value: 2 });
  });

  it("evaluates top-level statements separated by ';'", () => {
    expect(evaluateTuff("1; 2")).toEqual({ ok: true, value: 2 });
  });
});
