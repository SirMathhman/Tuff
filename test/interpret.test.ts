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

  it("block followed by let and reference evaluates correctly", () => {
    const result = interpret("{ let x = 100; } let x = 200; x");
    expect(result).toEqual({ ok: true, value: 200 });
  });

  it("supports mutable reassignment", () => {
    const result = interpret("let mut x = 0; x = 200; x");
    expect(result).toEqual({ ok: true, value: 200 });
  });

  it("errors on assignment to immutable binding", () => {
    const result = interpret("let x = 0; x = 200;");
    expect(result.ok).toBe(false);
  });
});

describe("interpret - structs", () => {
  it("empty struct declaration evaluates to 0", () => {
    const result = interpret("struct Empty {}");
    expect(result).toEqual({ ok: true, value: 0 });
  });

  it("struct declaration with a field evaluates to 0", () => {
    const result = interpret("struct Wrapper { value : I32 }");
    expect(result).toEqual({ ok: true, value: 0 });
  });

  it("struct declaration with multiple fields evaluates to 0", () => {
    const result = interpret("struct Empty { x : I32, y : I32 }");
    expect(result).toEqual({ ok: true, value: 0 });
  });

  it("errors on duplicate struct fields", () => {
    const result = interpret("struct Empty { x : I32, x : I32 }");
    expect(result.ok).toBe(false);
  });

  it("errors on unknown field types", () => {
    const result = interpret("struct Empty { x : UndefinedType }");
    expect(result.ok).toBe(false);
  });

  it("errors on duplicate struct declarations", () => {
    const result = interpret("struct Empty {} struct Empty {}");
    expect(result).toEqual({ ok: false, error: "Duplicate binding" });
  });

  it("instantiation and field access works", () => {
    const result = interpret(
      "struct Wrapper { x : I32 } let value : Wrapper = Wrapper { 100 }; value.x"
    );
    expect(result).toEqual({ ok: true, value: 100 });
  });

  it("type alias works for primitive types", () => {
    const result = interpret(
      "type MyAlias = I32; let value : MyAlias = 100; value"
    );
    expect(result).toEqual({ ok: true, value: 100 });
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
