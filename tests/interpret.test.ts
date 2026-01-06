import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { isOk, isErr } from "../src/result";

describe("interpret", () => {
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

  it("returns Err on malformed parentheses", () => {
    const r = interpret("(3 + 1");
    expect(isErr(r)).toBe(true);
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

  it("returns Err on invalid tokens", () => {
    const r = interpret("a - 1");
    expect(isErr(r)).toBe(true);
  });
});
