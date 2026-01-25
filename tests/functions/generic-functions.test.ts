import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("interpret - generic functions", () => {
  it("supports basic generic function with value parameter", () => {
    assertInterpretValid("fn pass<T>(value : T) => value; pass(100)", 100);
  });

  it("supports generic function with multiple type parameters", () => {
    assertInterpretValid(
      "fn identity<A>(x : A) => x; fn second<B, C>(a : B, b : C) => b; second(1, 2)",
      2,
    );
  });

  it("supports generic function returning first parameter", () => {
    assertInterpretValid(
      "fn first<A, B>(a : A, b : B) => a; first(100, 200)",
      100,
    );
  });

  it("supports generic function with operations on generic type", () => {
    assertInterpretValid("fn double<T>(x : T) => x + x; double(50)", 100);
  });

  it("supports generic function in expressions", () => {
    assertInterpretValid("fn identity<T>(x : T) => x; identity(50) * 2", 100);
  });

  it("supports named calls to generic functions", () => {
    assertInterpretValid("fn swap<A, B>(a : A, b : B) => b; swap(1, 2)", 2);
  });

  it("supports generic function with computation", () => {
    assertInterpretValid("fn increment<T>(x : T) => x + 1; increment(99)", 100);
  });

  it("supports multiple generic function definitions", () => {
    assertInterpretValid(
      "fn id1<T>(x : T) => x; fn id2<U>(y : U) => y + 1; id2(49)",
      50,
    );
  });
});
