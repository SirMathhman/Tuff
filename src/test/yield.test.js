import { describe, it, expect } from "vitest";
import { interpret } from "../main/ts/interpret";
describe("Yield expressions", () => {
  it("should yield a simple value from a block", () => {
    expect(interpret("let x = { yield 100; } x")).toBe(100);
  });
  it("should yield an expression from a block", () => {
    expect(interpret("let x = { yield 1 + 2; } x")).toBe(3);
  });
  it("should exit block early on yield, ignoring subsequent statements", () => {
    expect(interpret("let x = { yield 50; 100; } x")).toBe(50);
  });
  it("should yield from nested blocks", () => {
    expect(interpret("let x = { let y = { yield 42; }; y } x")).toBe(42);
  });
  it("should yield with variable access", () => {
    expect(interpret("let y = 10; let x = { yield y + 5; } x")).toBe(15);
  });
  it("should yield in a function", () => {
    expect(interpret("fn test() : I32 => { yield 99; }; test()")).toBe(99);
  });
  it("should call defined function", () => {
    expect(interpret("fn id(x : I32) : I32 => x; id(99)")).toBe(99);
  });
  it("should yield with complex expression", () => {
    expect(interpret("let x = { yield 10 * 5 + 3; }; x")).toBe(53);
  });
  it("should yield inside if block", () => {
    expect(interpret("{ if (true) { yield 100; } }")).toBe(100);
  });
  it("should not yield if condition false", () => {
    expect(interpret("{ if (false) { yield 100; } else { 50 } }")).toBe(50);
  });
  it("should yield in nested if", () => {
    expect(interpret("{ if (true) { if (true) { yield 99; } } }")).toBe(99);
  });
  it("should use yield result in expression", () => {
    expect(
      interpret("fn get() : I32 => { let x = { yield 100; } x + 50 } get()")
    ).toBe(150);
  });
  it("should return from function early", () => {
    expect(
      interpret("fn get() : I32 => { let x = { return 100; } x + 50 } get()")
    ).toBe(100);
  });
  it("should skip execution after return", () => {
    expect(interpret("fn get() : I32 => { return 42; 100; } get()")).toBe(42);
  });
});
