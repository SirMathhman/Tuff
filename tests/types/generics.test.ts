import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("interpret - generic structs", () => {
  it("supports basic generic struct declaration and instantiation", () => {
    expect(
      interpret(
        "struct Wrapper<T> { field : T } let value : Wrapper<I32> = Wrapper<I32> { field : 100 }; value.field",
      ),
    ).toBe(100);
  });

  it("supports multiple generic type parameters", () => {
    expect(
      interpret(
        "struct Pair<A, B> { first : A, second : B } let p : Pair<I32, I32> = Pair<I32, I32> { first : 10, second : 20 }; p.first",
      ),
    ).toBe(10);
  });

  it("supports accessing second generic type parameter field", () => {
    expect(
      interpret(
        "struct Pair<A, B> { first : A, second : B } let p : Pair<I32, I32> = Pair<I32, I32> { first : 10, second : 20 }; p.second",
      ),
    ).toBe(20);
  });

  it("supports generic struct with mixed type parameters", () => {
    expect(
      interpret(
        "struct Box<T> { value : T } let b1 : Box<I32> = Box<I32> { value : 42 }; let b2 : Box<I32> = Box<I32> { value : 100 }; b1.value + b2.value",
      ),
    ).toBe(142);
  });

  it("supports generic struct in expressions", () => {
    expect(
      interpret(
        "struct Wrapper<T> { field : T } let w : Wrapper<I32> = Wrapper<I32> { field : 50 }; w.field * 2",
      ),
    ).toBe(100);
  });

  it("supports nested generic instantiation", () => {
    expect(
      interpret(
        "struct Container<T> { item : T } let c : Container<I32> = Container<I32> { item : (5 + 10) }; c.item",
      ),
    ).toBe(15);
  });
});
