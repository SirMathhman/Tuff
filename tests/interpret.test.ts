import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { isOk, isErr } from "../src/result";

describe("interpret - parsing & simple ops", () => {
  it("is a function", () => {
    expect(typeof interpret).toBe("function");
  });

  it("parses integer numeric string", () => {
    const r = interpret("1");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);
  });

  it("parses a simple addition expression", () => {
    const r = interpret("1 + 2");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(3);
  });

  it("parses chained addition expressions", () => {
    const r = interpret("1+2+3");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(6);
  });

  it("parses spaced chained addition expressions", () => {
    const r = interpret("1 + 2 + 3");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(6);
  });

  it("handles decimals and negatives", () => {
    const r = interpret("-1 + 2.5");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1.5);
  });

  it("supports unary minus after operator", () => {
    const r = interpret("1 - -2");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(3);
  });
});

describe("interpret - precedence and mixing", () => {
  it("respects multiplication precedence", () => {
    const r = interpret("10 * 5 + 3");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(53);
  });

  it("respects multiplication precedence with leading addition", () => {
    const r = interpret("3 + 10 * 5");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(53);
  });

  it("parses mixed precedence expressions", () => {
    const r1 = interpret("10 + 5 * 3");
    expect(isOk(r1)).toBe(true);
    if (isOk(r1)) expect(r1.value).toBe(25);

    const r2 = interpret("2 * -3 + 1");
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(-5);
  });

  it("parses subtraction", () => {
    const r = interpret("10 - 5");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(5);
  });

  it("parses mixed left-to-right expressions", () => {
    const r1 = interpret("10 - 5 + 3");
    expect(isOk(r1)).toBe(true);
    if (isOk(r1)) expect(r1.value).toBe(8);
    const r2 = interpret("1 + 2 - 3");
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(0);
    const r3 = interpret("1 - 2 - 3");
    expect(isOk(r3)).toBe(true);
    if (isOk(r3)) expect(r3.value).toBe(-4);
  });
});

describe("interpret - parentheses, division & modulus", () => {
  it("evaluates parentheses expressions", () => {
    const r = interpret("(3 + 10) * 5");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(65);

    const r2 = interpret("2 * (1 + (3 - 1))");
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(6);

    const r3 = interpret("( -3 + 4 ) * 5");
    expect(isOk(r3)).toBe(true);
    if (isOk(r3)) expect(r3.value).toBe(5);
  });

  it("division and divide-by-zero handling", () => {
    const r1 = interpret("10 / 2");
    expect(isOk(r1)).toBe(true);
    if (isOk(r1)) expect(r1.value).toBe(5);

    const r2 = interpret("10 / (2 - 2)");
    expect(isErr(r2)).toBe(true);
    if (isErr(r2)) expect(r2.error).toBe("Division by zero");

    const r3 = interpret("10 / 2 + 3");
    expect(isOk(r3)).toBe(true);
    if (isOk(r3)) expect(r3.value).toBe(8);
  });

  it("modulus and modulo-by-zero handling", () => {
    const m1 = interpret("10 % 3");
    expect(isOk(m1)).toBe(true);
    if (isOk(m1)) expect(m1.value).toBe(1);

    const m2 = interpret("10 % (5 - 5)");
    expect(isErr(m2)).toBe(true);
    if (isErr(m2)) expect(m2.error).toBe("Division by zero");

    const m3 = interpret("10 + 5 % 3");
    expect(isOk(m3)).toBe(true);
    if (isOk(m3)) expect(m3.value).toBe(12);
  });

  it("returns Err on malformed parentheses", () => {
    const r = interpret("(3 + 1");
    expect(isErr(r)).toBe(true);
  });
});

describe("interpret - identifiers", () => {
  it("returns Err on undefined identifier", () => {
    const r = interpret("a - 1");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("Undefined variable");
  });

  it("errors on referencing undefined variable", () => {
    const r = interpret("x");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("Undefined variable");
  });
});

describe("interpret - let & assignment", () => {
  it("supports let bindings and I32 coercion", () => {
    const r = interpret("let x : I32 = (3 + 10) * 5; x");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(65);

    const r2 = interpret("let y : I32 = 1.9; y");
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(1);
  });

  it("supports mutable binding and assignment", () => {
    const r = interpret("let mut x : I32 = 0; x = (3 + 10) * 5; x");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(65);

    const r2 = interpret("let mut a : I32 = 2; a = a * 3; a");
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(6);
  });

  it("errors when assigning to immutable or undefined variables", () => {
    const r = interpret("let x : I32 = 1; x = 2;");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("Cannot assign to immutable variable");

    const r2 = interpret("y = 1;");
    expect(isErr(r2)).toBe(true);
    if (isErr(r2)) expect(r2.error).toBe("Undefined variable");
  });

  it("allows initializing uninitialized variable without mut", () => {
    const r = interpret("let x : I32; x = 100; x");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(100);
  });

  it("errors when reading uninitialized variable", () => {
    const r = interpret("let x : I32; x");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("Uninitialized variable");
  });

  it("respects I32 coercion on assignment", () => {
    const r = interpret("let x : I32; x = 1.9; x");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);
  });
});

describe("interpret - if expressions", () => {
  it("evaluates if with true condition", () => {
    const r = interpret("let x : I32 = if (true) 3 else 5; x");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(3);
  });

  it("evaluates if with false condition", () => {
    const r = interpret("let x : I32 = if (false) 3 else 5; x");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(5);
  });

  it("evaluates bare if expression", () => {
    const r = interpret("if (true) 1 else 0");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);
  });
});
