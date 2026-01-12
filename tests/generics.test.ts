import { interpret } from "../src/interpret";

describe("interpret - generics (basic inference)", () => {
  it("identity with number", () => {
    expect(interpret("fn id<T>(x : T) => x; id(1)")).toBe(1);
  });

  it("identity with bool", () => {
    expect(interpret("fn id<T>(x : T) => x; id(true)")).toBe(1);
  });

  it("multiple type parameters", () => {
    expect(interpret("fn pair<T, U>(a : T, b : U) => a; pair(1, true)")).toBe(
      1
    );
  });

  it("same generic used twice - consistent inference", () => {
    expect(interpret("fn same<T>(a : T, b : T) => a; same(1, 2)")).toBe(1);
  });

  it("same generic used twice - inconsistent inference throws", () => {
    expect(() =>
      interpret("fn same<T>(a : T, b : T) => a; same(1, true)")
    ).toThrow("Argument type mismatch");
  });
});

describe("interpret - generics with function types", () => {
  it("apply with function param infers generic", () => {
    expect(
      interpret(
        "fn apply<T>(f : (T)=>T, x : T) => f(x); fn inc(a : I32) => a + 1; apply(inc, 4)"
      )
    ).toBe(5);
  });

  it("apply with mismatched second arg throws", () => {
    expect(() =>
      interpret(
        "fn apply<T>(f : (T)=>T, x : T) => f(x); fn inc(a : I32) => a + 1; apply(inc, true)"
      )
    ).toThrow("Argument type mismatch");
  });
});

describe("interpret - generics with pointers and linear types", () => {
  it("deref generic pointer returns pointee", () => {
    expect(
      interpret(
        "fn deref<T>(q : *T) => *q; let x : I32 = 10; let p : *I32 = &x; deref(p)"
      )
    ).toBe(10);
  });

  it("pointer generic mismatch throws", () => {
    expect(() =>
      interpret(
        "fn deref<T>(q : *T) => *q; let x : I32 = 1; let p : *Bool = &x; deref(p)"
      )
    ).toThrow("Pointer type mismatch");
  });

  it("passing linear generic moves the value (use-after-move)", () => {
    expect(() =>
      interpret(
        "fn drop(v: I32) => { 0 }; type L = I32 then drop; fn accept<T>(x : T) => 0; let x : L = 10; accept(x); x"
      )
    ).toThrow("Use-after-move");
  });
});

describe("interpret - generics (multiple type parameters) - basics", () => {
  it("supports distinct multiple generic params", () => {
    expect(
      interpret(
        "fn triple<A,B,C>(a : A, b : B, c : C) => a; triple(1, true, 3)"
      )
    ).toBe(1);
  });

  it("picks second generic type correctly", () => {
    expect(
      interpret(
        "fn pickSecond<A,B,C>(a : A, b : B, c : C) => b; pickSecond(1, 2, 3)"
      )
    ).toBe(2);
  });

  it("conflicting generic inference across repeated param throws", () => {
    expect(() =>
      interpret(
        "fn conflict<T,U>(a : T, b : U, c : T) => a; conflict(1, 2, true)"
      )
    ).toThrow("Argument type mismatch");
  });

  it("compose with three generics (higher order) works", () => {
    expect(
      interpret(
        "fn compose<A,B,C>(f : (B)=>C, g : (A)=>B, x : A) => f(g(x)); fn inc(a : I32) => a + 1; fn double(a : I32) => a * 2; compose(inc, double, 3)"
      )
    ).toBe(7);
  });
});

describe("interpret - generics (multiple type parameters) - combos", () => {
  it("combines function and pointer generics", () => {
    expect(
      interpret(
        "fn combine<T,U>(pf : (T)=>U, a : T, p : *U) => pf(a) + *p; fn inc(a : I32) => a + 1; let y : I32 = 5; let p : *I32 = &y; combine(inc, 4, p)"
      )
    ).toBe(10);
  });

  it("pf(a) returns 5 inside generic", () => {
    expect(
      interpret(
        "fn test1<T,U>(pf : (T)=>U, a : T, p : *U) => pf(a); fn inc(a : I32) => a + 1; let y : I32 = 5; let p : *I32 = &y; test1(inc, 4, p)"
      )
    ).toBe(5);
  });

  it("deref p returns 5 inside generic", () => {
    expect(
      interpret(
        "fn test2<T,U>(pf : (T)=>U, a : T, p : *U) => *p; fn inc(a : I32) => a + 1; let y : I32 = 5; let p : *I32 = &y; test2(inc, 4, p)"
      )
    ).toBe(5);
  });

  it("combine with explicit locals works", () => {
    expect(
      interpret(
        "fn combine3<T,U>(pf:(T)=>U,a:T,p:*U) => { let r = pf(a); let s = *p; r + s }; fn inc(a : I32) => a + 1; let y : I32 = 5; let p : *I32 = &y; combine3(inc, 4, p)"
      )
    ).toBe(10);
  });
});

describe("interpret - generics and annotated return", () => {
  it("identity with annotated return", () => {
    expect(interpret("fn identity<T>(x : T) : T => x; identity(1)")).toBe(1);
  });
});
