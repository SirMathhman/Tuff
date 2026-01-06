import { describe, it, expect } from "vitest";
import { evalLeftToRight } from "../src/evalLeftToRight";
import { isOk, isErr } from "../src/result";

describe("evalLeftToRight", () => {
  it("evaluates left-to-right", () => {
    const tokens = [
      { type: "num", value: 10 } as const,
      { type: "op", value: "-" } as const,
      { type: "num", value: 5 } as const,
      { type: "op", value: "+" } as const,
      { type: "num", value: 3 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(8);
  });

  it("evaluates multiplication with precedence", () => {
    const tokens = [
      { type: "num", value: 10 } as const,
      { type: "op", value: "*" } as const,
      { type: "num", value: 5 } as const,
      { type: "op", value: "+" } as const,
      { type: "num", value: 3 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(53);
  });

  it("evaluates chained multiplication", () => {
    const tokens = [
      { type: "num", value: 2 } as const,
      { type: "op", value: "*" } as const,
      { type: "num", value: 3 } as const,
      { type: "op", value: "*" } as const,
      { type: "num", value: 4 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(24);
  });

  it("evaluates division and chained division", () => {
    const tokens = [
      { type: "num", value: 100 } as const,
      { type: "op", value: "/" } as const,
      { type: "num", value: 2 } as const,
      { type: "op", value: "/" } as const,
      { type: "num", value: 5 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(10);

    const r2 = evalLeftToRight([
      { type: "num", value: 20 } as const,
      { type: "op", value: "/" } as const,
      { type: "num", value: 5 } as const,
    ] as any);
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(4);
  });

  it("evaluates modulus and chained modulus", () => {
    const tokens = [
      { type: "num", value: 10 } as const,
      { type: "op", value: "%" } as const,
      { type: "num", value: 3 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(1);

    const tokens2 = [
      { type: "num", value: 20 } as const,
      { type: "op", value: "%" } as const,
      { type: "num", value: 6 } as const,
      { type: "op", value: "%" } as const,
      { type: "num", value: 4 } as const,
    ];
    const r2 = evalLeftToRight(tokens2 as any);
    expect(isOk(r2)).toBe(true);
    if (isOk(r2)) expect(r2.value).toBe(2);
  });

  it("evaluates parentheses grouping", () => {
    const tokens = [
      { type: "paren", value: "(" } as any,
      { type: "num", value: 3 } as const,
      { type: "op", value: "+" } as const,
      { type: "num", value: 10 } as const,
      { type: "paren", value: ")" } as any,
      { type: "op", value: "*" } as const,
      { type: "num", value: 5 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(65);
  });

  it("evaluates nested parentheses", () => {
    const tokens = [
      { type: "num", value: 2 } as const,
      { type: "op", value: "*" } as const,
      { type: "paren", value: "(" } as any,
      { type: "num", value: 1 } as const,
      { type: "op", value: "+" } as const,
      { type: "paren", value: "(" } as any,
      { type: "num", value: 3 } as const,
      { type: "op", value: "-" } as const,
      { type: "num", value: 1 } as const,
      { type: "paren", value: ")" } as any,
      { type: "paren", value: ")" } as any,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(6);
  });

  it("returns Err on invalid token sequence", () => {
    const r = evalLeftToRight([{ type: "op", value: "+" } as any]);
    expect(isErr(r)).toBe(true);
  });
});
