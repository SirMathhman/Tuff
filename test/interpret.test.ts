import { interpret } from "../src/interpret";

describe("interpret - arithmetic", () => {
  it("returns numeric literal", () => {
    const result = interpret("1");
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("returns 0 for empty input", () => {
    const result = interpret("");
    expect(result).toEqual({ ok: true, value: 0 });
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
});

describe("interpret - blocks", () => {
  it("reduces parentheses and evaluates inside them", () => {
    const result = interpret("3 + (10 * 5)");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("handles nested parentheses", () => {
    const result = interpret("(3 + (10 * 5))");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("evaluates block expressions", () => {
    const result = interpret("{ 100 }");
    expect(result).toEqual({ ok: true, value: 100 });
  });

  it("evaluates block with local let binding", () => {
    const result = interpret("{ let x = 100; x }");
    expect(result).toEqual({ ok: true, value: 100 });
  });

  it("evaluates block with local let and no body to 0", () => {
    const result = interpret("{ let x = 100; }");
    expect(result).toEqual({ ok: true, value: 0 });
  });

  it("evaluates boolean binding in block", () => {
    const result = interpret("{ let x = true; x }");
    expect(result).toEqual({ ok: true, value: 1 });
  });

  it("block can reference outer let binding", () => {
    const result = interpret("let x = 100; { x }");
    expect(result).toEqual({ ok: true, value: 100 });
  });

  it("error when referencing block-local binding outside block", () => {
    const result = interpret("{ let x = 100; } x");
    expect(result.ok).toBe(false);
  });
});

describe("interpret - bindings", () => {
  it("evaluates let bindings with typed annotation and body", () => {
    const result = interpret("let x : I32 = (3 + 10 * 5); x");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("evaluates let bindings without type annotation", () => {
    const result = interpret("let x = (3 + 10 * 5); x");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("supports referencing previous bindings", () => {
    const result = interpret("let x = (3 + 10 * 5); let y = x; y");
    expect(result).toEqual({ ok: true, value: 53 });
  });

  it("errors on duplicate bindings in the same scope", () => {
    const result = interpret("let x = (3 + 10 * 5); let x = 0;");
    expect(result).toEqual({ ok: false, error: "Duplicate binding" });
  });

  it("errors on nested duplicate bindings (shadowing disallowed)", () => {
    const result = interpret("let x = 100; { let x = 200; }");
    expect(result).toEqual({ ok: false, error: "Duplicate binding" });
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
