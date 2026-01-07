import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { isOk } from "../src/result";

describe("interpret - comparisons with variables", () => {
  it("compares variable values", () => {
    const r = interpret("let x : I32 = 5; x > 3");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);
  });

  it("compares two variables", () => {
    const r = interpret("let x : I32 = 5; let y : I32 = 3; x < y");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(0);
  });

  it("uses comparison in conditional", () => {
    const r = interpret("let x : I32 = 10; if (x > 5) 100 else 50");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(100);
  });

  it("stores comparison result in variable", () => {
    const r = interpret("let x : I32 = 5; let result : I32 = x > 3; result");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);
  });

  it("uses block result in comparison through variable binding", () => {
    const r = interpret("let x : I32 = { 5 }; x > 3");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);
  });
});
