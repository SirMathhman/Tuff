import { interpret } from "../src/interpret";

describe("interpret - generic structs (basic)", () => {
  it("instantiate and access fields", () => {
    expect(
      interpret(
        "struct Tuple<A, B> { first : A, second : B } let t : Tuple<I32, Bool> = { 1, true }; t.first + t.second"
      )
    ).toBe(2);
  });

  it("same generic used twice in struct", () => {
    expect(
      interpret(
        "struct Same<T> { a : T, b : T } let s : Same<I32> = { 1, 2 }; s.a + s.b"
      )
    ).toBe(3);
  });

  it("conflicting field initializer types throws", () => {
    expect(() =>
      interpret("struct Same<T> { a : T, b : T } let s : Same<I32> = { 1, true }")
    ).toThrow();
  });

  it("pointer field substitution works", () => {
    expect(
      interpret(
        "struct Wrapper<T> { p : *T } let x : I32 = 5; let px : *I32 = &x; let w : Wrapper<I32> = { px }; *w.p"
      )
    ).toBe(5);
  });

  it("array field substitution works", () => {
    expect(
      interpret(
        "struct WithArr<T> { a : [T; 3; 3] } let w : WithArr<I32> = { [1,2,3] }; w.a[1]"
      )
    ).toBe(2);
  });

  it("linear destructor with generic struct field drops on scope exit", () => {
    expect(
      interpret(
        `
          let mut sum : I32 = 0;
          fn drop(v: I32) => { sum = sum + v; };
          type L = I32 then drop;
          struct Holder<T> { v : T }
          { let x : L = 10; let h : Holder<L> = { x }; 0 };
          sum
        `
      )
    ).toBe(10);
  });
});
