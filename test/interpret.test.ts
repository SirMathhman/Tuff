import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (result shape)", () => {
  it("returns Result objects", () => {
    const r1 = interpret("");
    expect(r1.ok).toBe(true);
    expect(typeof r1.value).toBe("number");

    const r2 = interpret("hello");
    expect(r2.ok).toBe(true);
    expect(typeof r2.value).toBe("number");

    const r3 = interpret("1+1");
    expect(r3.ok).toBe(true);
    expect(typeof r3.value).toBe("number");
  });
});

describe("interpret (numeric parsing)", () => {
  it("parses numeric literals correctly", () => {
    expect(interpret("100")).toEqual({ ok: true, value: 100 });
    expect(interpret("+42")).toEqual({ ok: true, value: 42 });
    expect(interpret("-3.14")).toEqual({ ok: true, value: -3.14 });
  });
});

describe("interpret (suffix handling)", () => {
  it("parses leading numeric prefix (e.g., '100U8' => 100)", () => {
    expect(interpret("100U8")).toEqual({ ok: true, value: 100 });
    expect(interpret("255U8")).toEqual({ ok: true, value: 255 });
    expect(interpret("+42x")).toEqual({ ok: true, value: 42 });
    expect(interpret("-3.14y")).toEqual({
      ok: false,
      error: "negative numeric prefix with suffix is not allowed",
    });
    expect(interpret("-100U8")).toEqual({
      ok: false,
      error: "negative numeric prefix with suffix is not allowed",
    });
    expect(interpret("256U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });

    // U16 / U32

    expect(interpret("65536U16")).toEqual({
      ok: false,
      error: "value out of range for U16",
    });

    expect(interpret("4294967296U32")).toEqual({
      ok: false,
      error: "value out of range for U32",
    });

    // signed I8/I16
    expect(interpret("127I8")).toEqual({ ok: true, value: 127 });
    expect(interpret("-128I8")).toEqual({ ok: true, value: -128 });
    expect(interpret("128I8")).toEqual({
      ok: false,
      error: "value out of range for I8",
    });
    expect(interpret("32767I16")).toEqual({ ok: true, value: 32767 });
    expect(interpret("-32768I16")).toEqual({ ok: true, value: -32768 });
    expect(interpret("32768I16")).toEqual({
      ok: false,
      error: "value out of range for I16",
    });

    // fractional with integer suffix invalid
    expect(interpret("3.14U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });

  it("addition with sized operands works and enforces range", () => {
    expect(interpret("1U8 + 2U8")).toEqual({ ok: true, value: 3 });
    expect(interpret("255U8 + 1U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });
});
