import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("interpret - generic structs", () => {
  it("supports basic generic struct declaration and instantiation", () => {
    assertInterpretValid(
      "struct Wrapper<T> { field : T } let value : Wrapper<I32> = Wrapper<I32> { field : 100 }; value.field",
      100,
    );
  });

  it("supports multiple generic type parameters", () => {
    assertInterpretValid(
      "struct Pair<A, B> { first : A, second : B } let p : Pair<I32, I32> = Pair<I32, I32> { first : 10, second : 20 }; p.first",
      10,
    );
  });

  it("supports accessing second generic type parameter field", () => {
    assertInterpretValid(
      "struct Pair<A, B> { first : A, second : B } let p : Pair<I32, I32> = Pair<I32, I32> { first : 10, second : 20 }; p.second",
      20,
    );
  });

  it("supports generic struct with mixed type parameters", () => {
    assertInterpretValid(
      "struct Box<T> { value : T } let b1 : Box<I32> = Box<I32> { value : 42 }; let b2 : Box<I32> = Box<I32> { value : 100 }; b1.value + b2.value",
      142,
    );
  });

  it("supports generic struct in expressions", () => {
    assertInterpretValid(
      "struct Wrapper<T> { field : T } let w : Wrapper<I32> = Wrapper<I32> { field : 50 }; w.field * 2",
      100,
    );
  });

  it("supports nested generic instantiation", () => {
    assertInterpretValid(
      "struct Container<T> { item : T } let c : Container<I32> = Container<I32> { item : (5 + 10) }; c.item",
      15,
    );
  });
});
