import { describe, it } from "bun:test";
import { assertInterpretValid, assertInterpretInvalid, itBoth } from "../test-helpers";

describe("interpret - variables - basic", () => {
  itBoth("supports simple variable declaration", (assertValid) => {
    assertValid("let x : I32 = 3; x", 3);
  });

  itBoth("handles variable declarations in grouped expressions", (assertValid) => {
    assertValid("{ let x : I32 = 3; x }", 3);
  });

  // Compiler doesn't support nested braces in arithmetic expressions
  it("supports variable declarations with type annotations", () => {
    assertInterpretValid("(2 + { let x : I32 = 3; x }) * 4", 20);
  });

  itBoth("supports variable references in declarations", (assertValid) => {
    assertValid("let x : I32 = 100; let y : I32 = x; y", 100);
  });

  itBoth("supports variable declarations without type annotations", (assertValid) => {
    assertValid("let x = 100; let y = x; y", 100);
  });

  itBoth("throws on duplicate variable declaration in same scope", (assertValid, assertInvalid) => {
    assertInvalid("let x = 100; let x = 200; x");
  });
});

describe("interpret - variables - type coercion", () => {
  itBoth("allows narrower type assignment to wider type variable", (assertValid) => {
    assertValid("let x : U16 = 100U8; x", 100);
  });

  itBoth("throws when assigning wider type to narrower type variable", (assertValid, assertInvalid) => {
    assertInvalid("let x : U8 = 100U16; x");
  });

  // Compiler doesn't track type widths for variable-to-variable assignments
  it("throws when assigning variable of wider type to narrower type variable", () => {
    assertInterpretInvalid("let x = 100U16; let y : U8 = x; y");
  });
});

describe("interpret - variables - mutable", () => {
  itBoth("supports mutable variable assignment", (assertValid) => {
    assertValid("let mut x = 0; x = 100; x", 100);
  });

  itBoth("throws when reassigning immutable variable", (assertValid, assertInvalid) => {
    assertInvalid("let x = 0; x = 100; x");
  });

  itBoth("allows mutable variable reassignment inside grouped expressions", (assertValid) => {
    assertValid("let mut x = 0; { x = 100; } x", 100);
  });

  // Compiler doesn't track scope boundaries for variable lifetime
  it("throws when variable is declared inside grouped expressions and used outside", () => {
    assertInterpretInvalid("{ let mut x = 0; } x = 100; x");
  });
});

describe("interpret - variables - uninitialized", () => {
  // Compiler treats uninitialized variable assignment as immutable reassignment
  it("supports uninitialized variable declaration", () => {
    assertInterpretValid("let x : I32; x = 100; x", 100);
  });

  itBoth("throws when reassigning uninitialized variable without mut", (assertValid, assertInvalid) => {
    assertInvalid("let x : I32; x = 10; x = 20; x");
  });

  itBoth("supports mut uninitialized variable declaration", (assertValid) => {
    assertValid("let mut x : I32; x = 10; x = 20; x", 20);
  });

  // Compiler doesn't track uninitialized variable tracking through branches
  it("supports variable assignment inside if-else branches", () => {
    assertInterpretValid("let x : I32; if (true) x = 10; else x = 20; x", 10);
  });
});

describe("interpret - variables - pointers", () => {
  // Pointers are interpreter-only for now
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
  itBoth("supports calling function via this.methodName() at global scope", (assertValid) => {
    assertValid("fn get() => 100; this.get()", 100);
  });

  // Compiler transforms this.method() to method(this) which breaks when function has params
  it("supports function with parameters called via this", () => {
    assertInterpretValid(
      "fn add(a : I32, b : I32) => a + b; this.add(10, 20)",
      30,
    );
  });

  // Compiler has issues with this.method() inside function bodies
  it("supports this in function returning value", () => {
    assertInterpretValid(
      "fn getValue() => 42; fn wrapper() => this.getValue(); wrapper()",
      42,
    );
  });

  itBoth("supports function returning this with nested function", (assertValid) => {
    assertValid(
      "fn Wrapper(value : I32) => { fn get() => value; this }; Wrapper(100).get()",
      100,
    );
  });

  itBoth("supports nested functions in function returning this", (assertValid) => {
    assertValid(
      "fn getAdder(a : I32) => { fn add(b : I32) => a + b; this }; getAdder(10).add(5)",
      15,
    );
  });
});
