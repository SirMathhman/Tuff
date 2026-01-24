import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - generic functions", () => {
  it("supports basic generic function with value parameter", () => {
    expect(interpret("fn pass<T>(value : T) => value; pass(100)")).toBe(100);
  });

  it("supports generic function with multiple type parameters", () => {
    expect(
      interpret(
        "fn identity<A>(x : A) => x; fn second<B, C>(a : B, b : C) => b; second(1, 2)",
      ),
    ).toBe(2);
  });

  it("supports generic function returning first parameter", () => {
    expect(
      interpret("fn first<A, B>(a : A, b : B) => a; first(100, 200)"),
    ).toBe(100);
  });

  it("supports generic function with operations on generic type", () => {
    expect(interpret("fn double<T>(x : T) => x + x; double(50)")).toBe(100);
  });

  it("supports generic function in expressions", () => {
    expect(interpret("fn identity<T>(x : T) => x; identity(50) * 2")).toBe(100);
  });

  it("supports named calls to generic functions", () => {
    expect(interpret("fn swap<A, B>(a : A, b : B) => b; swap(1, 2)")).toBe(2);
  });

  it("supports generic function with computation", () => {
    expect(interpret("fn increment<T>(x : T) => x + 1; increment(99)")).toBe(
      100,
    );
  });

  it("supports multiple generic function definitions", () => {
    expect(
      interpret("fn id1<T>(x : T) => x; fn id2<U>(y : U) => y + 1; id2(49)"),
    ).toBe(50);
  });
});
