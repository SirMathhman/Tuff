import { add, evaluate } from "./index.js";
import { tokenize } from "./lexer.js";

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

  it('returns 3 for the addition expression "1 + 2"', () => {
    expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  it('returns 3 for the addition expression "1+2" without spaces', () => {
    expect(evaluate("1+2")).toEqual({ ok: true, value: 3 });
  });

  it('returns 3 for the addition expression " 1 + 2 " with surrounding whitespace', () => {
    expect(evaluate(" 1 + 2 ")).toEqual({ ok: true, value: 3 });
  });

  it("returns a not-implemented error for subtraction", () => {
    const result = evaluate("1 - 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-implemented");
      expect(result.error.source).toBe("1 - 2");
      expect(result.error.offset).toBe(2);
      expect(result.error.message).toContain("not implemented");
    }
  });

  it("returns a not-implemented error for chained addition", () => {
    const result = evaluate("1 + 2 + 3");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-implemented");
      expect(result.error.source).toBe("1 + 2 + 3");
      expect(result.error.offset).toBe(2);
      expect(result.error.message).toContain("not supported yet");
    }
  });

  it("returns a structured error for invalid input", () => {
    const result = evaluate("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-literal");
      expect(result.error.source).toBe("abc");
      expect(result.error.offset).toBe(0);
      expect(result.error.message).toContain("not a valid numeric literal");
    }
  });

  it('returns -5 for the negative literal "-5"', () => {
    expect(evaluate("-5")).toEqual({ ok: true, value: -5 });
  });

  it("returns a not-implemented error for a lone operator", () => {
    const result = evaluate("+");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-implemented");
      expect(result.error.offset).toBe(0);
    }
  });

  it("returns an invalid-literal error for a malformed number", () => {
    const result = evaluate("1.2.3");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-literal");
      expect(result.error.offset).toBe(0);
    }
  });

  it("returns an invalid-literal error for a malformed negative number", () => {
    const result = evaluate("-1.2.3");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-literal");
      expect(result.error.offset).toBe(1);
    }
  });

  it("returns an invalid-literal error when the right operand is malformed", () => {
    const result = evaluate("1 + 2.3.4");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-literal");
      expect(result.error.offset).toBe(4);
    }
  });

  it("returns an invalid-literal error when the left operand is malformed", () => {
    const result = evaluate("1.2.3 + 4");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-literal");
      expect(result.error.offset).toBe(0);
    }
  });

  it("returns a not-implemented error for a repeated operator", () => {
    const result = evaluate("1 + +");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-implemented");
      expect(result.error.offset).toBe(2);
    }
  });

  it("returns a not-implemented error for two literals with no operator", () => {
    const result = evaluate("1 2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-implemented");
      expect(result.error.offset).toBe(0);
    }
  });
});

describe("tokenize", () => {
  it("tokenizes an addition expression with offsets", () => {
    expect(tokenize("1 + 2")).toEqual([
      { kind: "number", value: "1", offset: 0 },
      { kind: "plus", offset: 2 },
      { kind: "number", value: "2", offset: 4 },
    ]);
  });

  it("tokenizes a negative literal", () => {
    expect(tokenize("-5")).toEqual([
      { kind: "minus", offset: 0 },
      { kind: "number", value: "5", offset: 1 },
    ]);
  });

  it("emits invalid tokens for non-numeric characters", () => {
    expect(tokenize("a")).toEqual([{ kind: "invalid", value: "a", offset: 0 }]);
  });

  it("returns no tokens for whitespace-only input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});
