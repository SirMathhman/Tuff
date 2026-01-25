import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("interpret - functions - declarations", () => {
  it("supports function declaration and calls", () => {
    assertInterpretValid(
      "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)",
      7,
    );
  });

  it("supports function references and calls through variables", () => {
    assertInterpretValid(
      "fn get() : I32 => 100; let func : () => I32 = get; func()",
      100,
    );
  });

  it("supports forward function references - function calling function declared later", () => {
    assertInterpretValid("fn get0() => get1(); fn get1() => 100; get0()", 100);
  });
});

describe("interpret - functions - lambdas", () => {
  it("supports anonymous functions and lambda expressions", () => {
    assertInterpretValid("let func : () => I32 = () : I32 => 100; func()", 100);
  });

  it("supports lambda expressions without type annotations", () => {
    assertInterpretValid("let func : () => I32 = () => 100; func()", 100);
  });

  it("supports function parameters with function types", () => {
    assertInterpretValid(
      "fn perform(action : (I32, I32) => I32) => action(3, 4); perform((first : I32, second : I32) => first + second)",
      7,
    );
  });
});

describe("interpret - functions - scope and methods", () => {
  it("supports function scope closure with mutable outer variable", () => {
    assertInterpretValid("let mut x = 0; fn add() => x += 1; add(); x", 1);
  });

  it("supports method call syntax with receiver as this parameter", () => {
    assertInterpretValid(
      "fn add(this : I32, argument : I32) => this + argument; 100.add(50)",
      150,
    );
  });

  it("supports chained method calls", () => {
    assertInterpretValid(
      "fn add(this : I32, argument : I32) => this + argument; 100.add(10).add(20)",
      130,
    );
  });
});
