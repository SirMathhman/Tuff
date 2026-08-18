import { evaluate } from "./index.js";

describe("evaluate: happy paths", () => {
  it("evaluates an empty string to 0", () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  it('evaluates "1" to 1', () => {
    expect(evaluate("1")).toEqual({ ok: true, value: 1 });
  });

  it('evaluates "1 + 2" to 3', () => {
    expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  it('evaluates "1 + 2 + 3" to 6', () => {
    expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
  });

  it('evaluates "2 + 3 - 4" to 1', () => {
    expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
  });

  it('evaluates "2 * 3 + 4" to 10 (precedence)', () => {
    expect(evaluate("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
  });

  it('evaluates "(1 + 2) * 3" to 9 (parentheses)', () => {
    expect(evaluate("(1 + 2) * 3")).toEqual({ ok: true, value: 9 });
  });

  it('evaluates "-1 + 2" to 1 (unary minus)', () => {
    expect(evaluate("-1 + 2")).toEqual({ ok: true, value: 1 });
  });

  it('evaluates "1.5 * 2" to 3 (decimals)', () => {
    expect(evaluate("1.5 * 2")).toEqual({ ok: true, value: 3 });
  });
});

describe("evaluate: error paths", () => {
  it('returns a lex error with position for "1 & 2"', () => {
    const result = evaluate("1 & 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("lex");
      expect(result.error.position).toEqual({ offset: 2, line: 1, column: 3 });
      expect(result.error.message).toContain('"&"');
      expect(result.error.hint).toBeTruthy();
    }
  });

  it('returns a parse error for a dangling operator "1 +"', () => {
    const result = evaluate("1 +");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parse");
      expect(result.error.message).toContain("end of expression");
      expect(result.error.hint).toBeTruthy();
    }
  });

  it('returns a parse error for an unclosed parenthesis "(1 + 2"', () => {
    const result = evaluate("(1 + 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parse");
      expect(result.error.message).toContain("closing parenthesis");
      expect(result.error.hint).toContain(")");
    }
  });

  it('returns a parse error for a trailing token "1 2"', () => {
    const result = evaluate("1 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parse");
      expect(result.error.message).toContain("trailing");
      expect(result.error.position).toEqual({ offset: 2, line: 1, column: 3 });
    }
  });
});
