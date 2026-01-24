import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - variables", () => {
  it("supports simple variable declaration", () => {
    expect(interpret("let x : I32 = 3; x")).toBe(3);
  });

  it("handles variable declarations in grouped expressions", () => {
    expect(interpret("{ let x : I32 = 3; x }")).toBe(3);
  });

  it("supports variable declarations with type annotations", () => {
    expect(interpret("(2 + { let x : I32 = 3; x }) * 4")).toBe(20);
  });

  it("supports variable references in declarations", () => {
    expect(interpret("let x : I32 = 100; let y : I32 = x; y")).toBe(100);
  });

  it("supports variable declarations without type annotations", () => {
    expect(interpret("let x = 100; let y = x; y")).toBe(100);
  });

  it("throws on duplicate variable declaration in same scope", () => {
    expect(() => interpret("let x = 100; let x = 200; x")).toThrow();
  });

  it("allows narrower type assignment to wider type variable", () => {
    expect(interpret("let x : U16 = 100U8; x")).toBe(100);
  });

  it("throws when assigning wider type to narrower type variable", () => {
    expect(() => interpret("let x : U8 = 100U16; x")).toThrow();
  });

  it("throws when assigning variable of wider type to narrower type variable", () => {
    expect(() => interpret("let x = 100U16; let y : U8 = x; y")).toThrow();
  });

  it("supports mutable variable assignment", () => {
    expect(interpret("let mut x = 0; x = 100; x")).toBe(100);
  });

  it("throws when reassigning immutable variable", () => {
    expect(() => interpret("let x = 0; x = 100; x")).toThrow();
  });

  it("allows mutable variable reassignment inside grouped expressions", () => {
    expect(interpret("let mut x = 0; { x = 100; } x")).toBe(100);
  });

  it("throws when variable is declared inside grouped expressions and used outside", () => {
    expect(() => interpret("{ let mut x = 0; } x = 100; x")).toThrow();
  });

  it("supports uninitialized variable declaration", () => {
    expect(interpret("let x : I32; x = 100; x")).toBe(100);
  });

  it("throws when reassigning uninitialized variable without mut", () => {
    expect(() => interpret("let x : I32; x = 10; x = 20; x")).toThrow();
  });

  it("supports mut uninitialized variable declaration", () => {
    expect(interpret("let mut x : I32; x = 10; x = 20; x")).toBe(20);
  });

  it("supports variable assignment inside if-else branches", () => {
    expect(interpret("let x : I32; if (true) x = 10; else x = 20; x")).toBe(10);
  });

  it("supports pointer creation and dereferencing", () => {
    expect(interpret("let x = 100; let y : *I32 = &x; *y")).toBe(100);
  });

  it("supports pointer dereferencing with modification", () => {
    expect(interpret("let mut x = 100; let y : *I32 = &x; *y")).toBe(100);
  });

  it("supports chained pointer operations", () => {
    expect(interpret("let x = 42; let p = &x; let pp : *I32 = p; *pp")).toBe(
      42,
    );
  });

  it("supports mutable pointer with dereferencing assignment", () => {
    expect(
      interpret(
        "let mut x = 100; let y : *mut I32 = &x; *y = 100; x",
      ),
    ).toBe(100);
  });
});
