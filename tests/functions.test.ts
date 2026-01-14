import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("function declarations and calls", () => {
  it("simple function call (fn add(first : I32, second : I32) : I32 => first + second; add(3, 4) => 7)", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)"
      )
    ).toBe(7);
  });

  it("function with single parameter", () => {
    expect(
      interpret("fn double(x : I32) : I32 => x * 2; double(5)")
    ).toBe(10);
  });

  it("function returning boolean", () => {
    expect(
      interpret("fn isTrue() : Bool => true; isTrue()")
    ).toBe(1);
  });

  it("function call with no parameters", () => {
    expect(
      interpret("fn getAnswer() : I32 => 42; getAnswer()")
    ).toBe(42);
  });

  it("throws on wrong number of arguments", () => {
    expect(() =>
      interpret("fn add(a : I32, b : I32) : I32 => a + b; add(1)")
    ).toThrow();
  });

  it("function using variables from outer scope", () => {
    expect(
      interpret("let x = 10; fn add(y : I32) : I32 => x + y; add(5)")
    ).toBe(15);
  });
});
