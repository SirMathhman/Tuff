import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - functions", () => {
  it("supports function declaration and calls", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)",
      ),
    ).toBe(7);
  });

  it("supports function references and calls through variables", () => {
    expect(
      interpret("fn get() : I32 => 100; let func : () => I32 = get; func()"),
    ).toBe(100);
  });

  it("supports anonymous functions and lambda expressions", () => {
    expect(interpret("let func : () => I32 = () : I32 => 100; func()")).toBe(
      100,
    );
  });

  it("supports lambda expressions without type annotations", () => {
    expect(interpret("let func : () => I32 = () => 100; func()")).toBe(100);
  });

  it("supports function parameters with function types", () => {
    expect(
      interpret(
        "fn perform(action : (I32, I32) => I32) => action(3, 4); perform((first : I32, second : I32) => first + second)",
      ),
    ).toBe(7);
  });
});
