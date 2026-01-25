import { describe, it } from "bun:test";
import { assertInterpretValid, assertInterpretInvalid } from "../test-helpers";

describe("interpret - variables - basic", () => {
  it("supports simple variable declaration", () => {
    assertInterpretValid("let x : I32 = 3; x", 3);
  });

  it("handles variable declarations in grouped expressions", () => {
    assertInterpretValid("{ let x : I32 = 3; x }", 3);
  });

  it("supports variable declarations with type annotations", () => {
    assertInterpretValid("(2 + { let x : I32 = 3; x }) * 4", 20);
  });

  it("supports variable references in declarations", () => {
    assertInterpretValid("let x : I32 = 100; let y : I32 = x; y", 100);
  });

  it("supports variable declarations without type annotations", () => {
    assertInterpretValid("let x = 100; let y = x; y", 100);
  });

  it("throws on duplicate variable declaration in same scope", () => {
    assertInterpretInvalid("let x = 100; let x = 200; x");
  });
});

describe("interpret - variables - type coercion", () => {
  it("allows narrower type assignment to wider type variable", () => {
    assertInterpretValid("let x : U16 = 100U8; x", 100);
  });

  it("throws when assigning wider type to narrower type variable", () => {
    assertInterpretInvalid("let x : U8 = 100U16; x");
  });

  it("throws when assigning variable of wider type to narrower type variable", () => {
    assertInterpretInvalid("let x = 100U16; let y : U8 = x; y");
  });
});

describe("interpret - variables - mutable", () => {
  it("supports mutable variable assignment", () => {
    assertInterpretValid("let mut x = 0; x = 100; x", 100);
  });

  it("throws when reassigning immutable variable", () => {
    assertInterpretInvalid("let x = 0; x = 100; x");
  });

  it("allows mutable variable reassignment inside grouped expressions", () => {
    assertInterpretValid("let mut x = 0; { x = 100; } x", 100);
  });

  it("throws when variable is declared inside grouped expressions and used outside", () => {
    assertInterpretInvalid("{ let mut x = 0; } x = 100; x");
  });
});

describe("interpret - variables - uninitialized", () => {
  it("supports uninitialized variable declaration", () => {
    assertInterpretValid("let x : I32; x = 100; x", 100);
  });

  it("throws when reassigning uninitialized variable without mut", () => {
    assertInterpretInvalid("let x : I32; x = 10; x = 20; x");
  });

  it("supports mut uninitialized variable declaration", () => {
    assertInterpretValid("let mut x : I32; x = 10; x = 20; x", 20);
  });

  it("supports variable assignment inside if-else branches", () => {
    assertInterpretValid("let x : I32; if (true) x = 10; else x = 20; x", 10);
  });
});

describe("interpret - variables - pointers", () => {
  it("supports pointer creation and dereferencing", () => {
    assertInterpretValid("let x = 100; let y : *I32 = &x; *y", 100);
  });

  it("supports pointer dereferencing with modification", () => {
    assertInterpretValid("let mut x = 100; let y : *I32 = &x; *y", 100);
  });

  it("supports chained pointer operations", () => {
    assertInterpretValid("let x = 42; let p = &x; let pp : *I32 = p; *pp", 42);
  });

  it("supports mutable pointer with dereferencing assignment", () => {
    assertInterpretValid(
      "let mut x = 100; let y : *mut I32 = &x; *y = 100; x",
      100,
    );
  });

  it("supports pointer access to array elements", () => {
    assertInterpretValid(
      "let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]",
      6,
    );
  });
});

describe("interpret - variables - this keyword", () => {
  it("supports calling function via this.methodName() at global scope", () => {
    assertInterpretValid("fn get() => 100; this.get()", 100);
  });

  it("supports function with parameters called via this", () => {
    assertInterpretValid(
      "fn add(a : I32, b : I32) => a + b; this.add(10, 20)",
      30,
    );
  });

  it("supports this in function returning value", () => {
    assertInterpretValid(
      "fn getValue() => 42; fn wrapper() => this.getValue(); wrapper()",
      42,
    );
  });

  it("supports function returning this with nested function", () => {
    assertInterpretValid(
      "fn Wrapper(value : I32) => { fn get() => value; this }; Wrapper(100).get()",
      100,
    );
  });

  it("supports nested functions in function returning this", () => {
    assertInterpretValid(
      "fn getAdder(a : I32) => { fn add(b : I32) => a + b; this }; getAdder(10).add(5)",
      15,
    );
  });
});
