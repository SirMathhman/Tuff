import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

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
    expect(
      interpret("fn test() : I32 => { yield 99; }; test()")
    ).toBe(99);
  });

  it("should yield after function with one param", () => {
    expect(
      interpret("fn one(x : I32) : I32 => x; { yield 42; }")
    ).toBe(42);
  });

  it("should call function defined earlier", () => {
    expect(
      interpret("fn one(x : I32) : I32 => x; one(5)")
    ).toBe(5);
  });

  it("should call defined function", () => {
    expect(
      interpret("fn id(x : I32) : I32 => x; id(99)")
    ).toBe(99);
  });

  it("should yield with complex expression", () => {
    expect(
      interpret("let x = { yield 10 * 5 + 3; }; x")
    ).toBe(53);
  });

  it("should handle yield with type-checked expressions", () => {
    expect(
      interpret("let x : I32 = { yield 25; }; x")
    ).toBe(25);
  });
});
