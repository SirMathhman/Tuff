import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("returns numeric literal", () => {
    const result = interpret("1");
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("evaluates simple addition", () => {
    const result = interpret("1 + 2");
    expect(result).toEqual({ ok: true, value: 3 });
  });

  it("evaluates chained additions", () => {
    const result = interpret("1 + 2 + 3");
    expect(result).toEqual({ ok: true, value: 6 });
  });

  it("evaluates additions and subtractions left-to-right", () => {
    const result = interpret("10 - 5 + 3");
    expect(result).toEqual({ ok: true, value: 8 });
  });

  it("respects multiplication precedence over addition", () => {
    const result = interpret("10 * 5 + 3");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("evaluates mixed precedence left-to-right (addition and multiplication)", () => {
    const result = interpret("3 + 10 * 5");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("reduces parentheses and evaluates inside them", () => {
    const result = interpret("3 + (10 * 5)");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("handles nested parentheses", () => {
    const result = interpret("(3 + (10 * 5))");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("evaluates let bindings with typed annotation and body", () => {
    const result = interpret("let x : I32 = (3 + 10 * 5); x");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("evaluates let binding with no body to 0", () => {
    const result = interpret("let x : I32 = (3 + 10 * 5);");
    expect(result).toEqual({ ok: true, value: 0 });
  });

  it("returns an error for division by zero", () => {
    const result = interpret("1 / 0");
    expect(result).toEqual({ ok: false, error: "Division by zero" });
  });
});
