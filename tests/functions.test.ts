import { describe, it } from "vitest";
import { interpret } from "../src/interpret";
import { expectOkValue } from "../src/utils/testUtils";

describe("functions - basic declaration and calls", () => {
  it("declares and calls simple function with expression body", () => {
    const r = interpret("fn add(x: I32) : I32 => x + 5; add(3)");
    expectOkValue(r, 8);
  });

  it("declares and calls function with no parameters", () => {
    const r = interpret("fn getAnswer() : I32 => 42; getAnswer()");
    expectOkValue(r, 42);
  });

  it("declares function with block body", () => {
    const r = interpret("fn inc(n: I32) : I32 => { n + 1 }; inc(5)");
    expectOkValue(r, 6);
  });

  it("function call returns correct value", () => {
    const r = interpret("fn mul(a: I32) : I32 => a * 2; mul(7)");
    expectOkValue(r, 14);
  });

  it("multiple function declarations", () => {
    const r = interpret(
      "fn double(x: I32) : I32 => x * 2; fn triple(x: I32) : I32 => x * 3; double(3) + triple(3)"
    );
    expectOkValue(r, 15);
  });
});

describe("functions - parameter handling", () => {
  it("function with simple parameter", () => {
    const r = interpret("fn check(n: I32) : I32 => 1; check(5)");
    expectOkValue(r, 1);
  });

  it("function receives and uses parameter", () => {
    const r = interpret("fn negate(x: I32) : I32 => 0 - x; negate(10)");
    expectOkValue(r, -10);
  });

  it("function parameter shadows outer variable", () => {
    const r = interpret(
      "let x : I32 = 100; fn use_param(x: I32) : I32 => x; use_param(5)"
    );
    expectOkValue(r, 5);
  });

  it("function parameter doesn't modify outer scope", () => {
    const r = interpret(
      "let x : I32 = 10; fn modify_param(x: I32) : I32 => x + 5; modify_param(3); x"
    );
    expectOkValue(r, 10);
  });
});

describe("functions - block and expression bodies", () => {
  it("function with block body containing single expression", () => {
    const r = interpret("fn square(n: I32) : I32 => { n * n }; square(4)");
    expectOkValue(r, 16);
  });

  it("function with block body containing multiple statements", () => {
    const r = interpret(
      "fn add_and_double(n: I32) : I32 => { let m : I32 = n + 1; m * 2 }; add_and_double(3)"
    );
    expectOkValue(r, 8);
  });

  it("function with block containing variable declaration", () => {
    const r = interpret(
      "fn calc(x: I32) : I32 => { let y : I32 = x * 2; y + 3 }; calc(5)"
    );
    expectOkValue(r, 13);
  });

  it("expression body without block", () => {
    const r = interpret("fn simple(x: I32) : I32 => x + 10; simple(5)");
    expectOkValue(r, 15);
  });
});

describe("functions - type handling", () => {
  it("I32 parameter is truncated", () => {
    const r = interpret("fn floor_val(n: I32) : I32 => n; floor_val(5.7)");
    expectOkValue(r, 5);
  });

  it("untyped parameter used as is", () => {
    const r = interpret("fn get_param(x) : I32 => x; get_param(3)");
    expectOkValue(r, 3);
  });

  it("function with return type annotation", () => {
    const r = interpret("fn add(x: I32) : I32 => x + 10; add(5)");
    expectOkValue(r, 15);
  });
});

describe("functions - return values", () => {
  it("function returns value from expression", () => {
    const r = interpret("fn add_five(n: I32) : I32 => n + 5; add_five(10)");
    expectOkValue(r, 15);
  });

  it("function returns value from block", () => {
    const r = interpret("fn compute(x: I32) : I32 => { x + 1 }; compute(9)");
    expectOkValue(r, 10);
  });

  it("function returns last evaluated expression in block", () => {
    const r = interpret(
      "fn complex(n: I32) : I32 => { let m : I32 = n * 2; m + 3; m }; complex(5)"
    );
    expectOkValue(r, 10);
  });
});

describe("functions - composition", () => {
  it("calling function result as argument", () => {
    const r = interpret(
      "fn inc(x: I32) : I32 => x + 1; fn double(x: I32) : I32 => x * 2; double(inc(5))"
    );
    expectOkValue(r, 12);
  });

  it("multiple function calls in expression", () => {
    const r = interpret(
      "fn add(x: I32) : I32 => x + 5; fn mul(x: I32) : I32 => x * 2; add(3) + mul(4)"
    );
    expectOkValue(r, 16);
  });

  it("function using another function's result", () => {
    const r = interpret(
      "fn square(x: I32) : I32 => x * x; fn inc_sq(x: I32) : I32 => square(x) + 1; inc_sq(3)"
    );
    expectOkValue(r, 10);
  });
});

describe("functions - basic operations", () => {
  it("function with comparison", () => {
    const r = interpret(
      "fn is_five(n: I32) : I32 => if n == 5 then 1 else 0; is_five(5)"
    );
    expectOkValue(r, 1);
  });

  it("function with arithmetic operations", () => {
    const r = interpret("fn compute(x: I32) : I32 => x * 2 + 3; compute(5)");
    expectOkValue(r, 13);
  });

  it("function returning computed value", () => {
    const r = interpret("fn avg(n: I32) : I32 => n / 2; avg(10)");
    expectOkValue(r, 5);
  });
});

describe("functions - integration with other features", () => {
  it("function called in let binding", () => {
    const r = interpret(
      "fn get_val(x: I32) : I32 => x * 3; let result : I32 = get_val(4); result"
    );
    expectOkValue(r, 12);
  });

  it("function in expression with variables", () => {
    const r = interpret(
      "let x : I32 = 5; fn add_to_x(y: I32) : I32 => x + y; add_to_x(3)"
    );
    expectOkValue(r, 8);
  });

  it("function in block expression", () => {
    const r = interpret("fn add(a: I32) : I32 => a + 10; { add(5) + 3 }");
    expectOkValue(r, 18);
  });

  it("function after variable mutation", () => {
    const r = interpret(
      "let mut x : I32 = 5; x = x + 5; fn use_x(y: I32) : I32 => x + y; use_x(1)"
    );
    expectOkValue(r, 11);
  });

  it("function defined after variables used", () => {
    const r = interpret(
      "let base : I32 = 10; fn add_base(x: I32) : I32 => base + x; add_base(5)"
    );
    expectOkValue(r, 15);
  });
});

describe("functions - edge cases", () => {
  it("function returning zero", () => {
    const r = interpret("fn get_zero(x: I32) : I32 => 0; get_zero(100)");
    expectOkValue(r, 0);
  });

  it("function with negative parameter", () => {
    const r = interpret("fn negate(n: I32) : I32 => 0 - n; negate(-5)");
    expectOkValue(r, 5);
  });

  it("function returning negative", () => {
    const r = interpret("fn get_neg(x: I32) : I32 => 0 - x; get_neg(5)");
    expectOkValue(r, -5);
  });

  it("function with division", () => {
    const r = interpret("fn half(n: I32) : I32 => n / 2; half(10)");
    expectOkValue(r, 5);
  });

  it("function with modulo", () => {
    const r = interpret("fn remainder(n: I32) : I32 => n % 3; remainder(10)");
    expectOkValue(r, 1);
  });
});
