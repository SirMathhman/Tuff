import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { isOk, isErr } from "../src/result";

describe("interpret - pointers", () => {
  it("reads value via pointer dereference", () => {
    const r = interpret("let x : I32 = 5; let p : *I32 = &x; *p");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(5);
  });

  it("assigns through mutable pointer to update target", () => {
    const r = interpret(
      "let mut x : I32 = 100; let y : *mut I32 = &x; *y = 200; x"
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(200);
  });

  it("errors when assigning through immutable pointer", () => {
    const r = interpret("let mut x : I32 = 5; let p : *I32 = &x; *p = 7;");
    expect(isErr(r)).toBe(true);
    if (isErr(r))
      expect(r.error).toBe("Cannot assign through immutable pointer");
  });

  it("errors when taking mutable address of immutable variable", () => {
    const r = interpret("let x : I32 = 5; let p : *mut I32 = &mut x;");
    expect(isErr(r)).toBe(true);
    if (isErr(r))
      expect(r.error).toBe("Cannot take mutable address of immutable variable");
  });

  it("supports pointer copy and assignment via copied pointer", () => {
    const r = interpret(
      "let mut x : I32 = 2; let p : *mut I32 = &x; let q : *mut I32 = p; *q = 5; x;"
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(5);
  });

  it("errors on invalid dereference", () => {
    const r = interpret("*42");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("Invalid dereference");
  });
});
