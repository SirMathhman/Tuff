import { interpret } from "../src/interpret";

describe("interpret - function argument type checking", () => {
  it("throws on simple param type mismatch", () => {
    expect(() => interpret("fn f(a : I32) => a; f(true)")).toThrow(
      "Argument type mismatch"
    );
  });

  it("accepts numeric literals for integer params", () => {
    expect(interpret("fn f(a : I32) => a; f(1)")).toBe(1);
    expect(interpret("fn g(a : U8) => a; g(1U8)")).toBe(1);
  });

  it("accepts pointer parameter and rejects passing pointer to numeric param", () => {
    expect(
      interpret(
        "fn mutate(p : *mut I32) => { *p = 10 }; let mut x = 0; let p : *mut I32 = &mut x; mutate(p); x"
      )
    ).toBe(10);

    expect(() =>
      interpret("fn f(a : I32) => a; let mut x = 0; let p : *I32 = &x; f(p)")
    ).toThrow("Argument type mismatch");
  });

  it("validates function-typed arguments by signature", () => {
    expect(
      interpret(
        "let apply = fn apply(f : (I32)=>I32, x : I32) => { f(x) }; let inc = fn inc(a : I32) => { a + 1 }; apply(inc, 4)"
      )
    ).toBe(5);

    expect(() =>
      interpret(
        "let apply = fn apply(f : (I32)=>I32, x : I32) => { f(x) }; let wrong = fn w(a : Bool) => a; apply(wrong, 1)"
      )
    ).toThrow("Argument type mismatch");
  });

  it("accepts arrow function assigned to annotated function type", () => {
    expect(interpret("let f : (I32)=>I32 = (a : I32) => a + 2; f(3)")).toBe(5);
  });

  it("resolves type aliases in parameter types", () => {
    expect(interpret("type MyInt = I32; fn f(a : MyInt) => a; f(1)")).toBe(1);
    expect(() =>
      interpret("type MyInt = I32; fn f(a : MyInt) => a; f(true)")
    ).toThrow("Argument type mismatch");
  });
});
