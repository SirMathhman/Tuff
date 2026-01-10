import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (stub)", () => {
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

  it("parses numeric literals correctly", () => {
    expect(interpret("100")).toEqual({ ok: true, value: 100 });
    expect(interpret("+42")).toEqual({ ok: true, value: 42 });
    expect(interpret("-3.14")).toEqual({ ok: true, value: -3.14 });
  });

  it("parses leading numeric prefix (e.g., '100U8' => 100)", () => {
    expect(interpret("100U8")).toEqual({ ok: true, value: 100 });
    expect(interpret("+42x")).toEqual({ ok: true, value: 42 });
    expect(interpret("-3.14y")).toEqual({ ok: false, error: "negative numeric prefix with suffix is not allowed" });
    expect(interpret("-100U8")).toEqual({ ok: false, error: "negative numeric prefix with suffix is not allowed" });
  });
});
