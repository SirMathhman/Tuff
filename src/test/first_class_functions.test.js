import { describe, it, expect } from "vitest";
import { interpret } from "../main/ts/interpret";
describe("First-class functions", () => {
  it("should assign function to variable and call it", () => {
    expect(
      interpret(
        "let temp : (I32, I32) => I32 = fn add(first : I32, second : I32) : I32 => first + second; temp(3, 4)"
      )
    ).toBe(7);
  });
  it("should assign zero-argument function to variable", () => {
    expect(interpret("let f : () => I32 = fn get() : I32 => 42; f()")).toBe(42);
  });
  it("should call assigned function multiple times", () => {
    expect(
      interpret(
        "let f : (I32) => I32 = fn double(x : I32) : I32 => x * 2; f(5) + f(3)"
      )
    ).toBe(16);
  });
  it("should support arrow function syntax", () => {
    expect(
      interpret(
        "let temp : (I32, I32) => I32 = (first : I32, second : I32) : I32 => first + second; temp(3, 4)"
      )
    ).toBe(7);
  });
  it("should support closure - functions capturing outer scope variables", () => {
    expect(interpret("let mut x = 0; fn add() => x += 1; add(); x")).toBe(1);
  });
});
