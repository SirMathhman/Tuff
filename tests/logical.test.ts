import { interpret } from "../src/interpret";

describe("interpret - logical operators && and || (short-circuit)", () => {
  it("basic && and || booleans", () => {
    expect(interpret("true && true")).toBe(1);
    expect(interpret("true && false")).toBe(0);
    expect(interpret("false || true")).toBe(1);
    expect(interpret("false || false")).toBe(0);
  });

  it("short-circuit && does not evaluate rhs when left false", () => {
    expect(
      interpret(
        "let mut x = 0; let a = 0; fn setX() => { x = 1; 1 }; a != 0 && setX(); x"
      )
    ).toBe(0);
  });

  it("short-circuit && evaluates rhs when left true", () => {
    expect(
      interpret(
        "let mut x = 0; let a = 1; fn setX() => { x = 1; 1 }; a != 0 && setX(); x"
      )
    ).toBe(1);
  });

  it("short-circuit || does not evaluate rhs when left true", () => {
    expect(
      interpret(
        "let mut x = 0; let a = 1; fn setX() => { x = 1; 1 }; a != 0 || setX(); x"
      )
    ).toBe(0);
  });

  it("short-circuit || evaluates rhs when left false", () => {
    expect(
      interpret(
        "let mut x = 0; let a = 0; fn setX() => { x = 1; 1 }; a != 0 || setX(); x"
      )
    ).toBe(1);
  });

  it("combines with comparisons: 1 < 2 && 2 < 3 -> 1", () => {
    expect(interpret("1 < 2 && 2 < 3")).toBe(1);
  });

  it("throws when non-number operands are used", () => {
    expect(() => interpret("let x = 1; let p = &x; p && 1")).toThrow(
      "Logical operands must be numbers"
    );
  });
});

// Unary NOT tests in separate describe to satisfy lint limits
describe("interpret - logical NOT '!'", () => {
  it("basic ! with booleans and numbers", () => {
    expect(interpret("!true")).toBe(0);
    expect(interpret("!false")).toBe(1);
    expect(interpret("!0")).toBe(1);
    expect(interpret("!1")).toBe(0);
    expect(interpret("!2")).toBe(0);
  });

  it("parenthesized & comparison interaction", () => {
    expect(interpret("!(1 == 1)")).toBe(0);
    expect(interpret("!(1 == 0)")).toBe(1);
  });

  it("precedence: ! binds tighter than comparison", () => {
    expect(interpret("!1 == 0")).toBe(1);
  });

  it("double negation", () => {
    expect(interpret("!!0")).toBe(0);
    expect(interpret("!!1")).toBe(1);
  });

  it("short-circuit interplay with ! and &&/||", () => {
    expect(
      interpret(
        "let mut x = 0; let a = 1; fn setX() => { x = 1; 1 }; !(a != 0) && setX(); x"
      )
    ).toBe(0);
    expect(
      interpret(
        "let mut x = 0; let a = 0; fn setX() => { x = 1; 1 }; !(a != 0) && setX(); x"
      )
    ).toBe(1);
    expect(
      interpret(
        "let mut x = 0; let a = 1; fn setX() => { x = 1; 1 }; !a || setX(); x"
      )
    ).toBe(0);
    expect(
      interpret(
        "let mut x = 0; let a = 0; fn setX() => { x = 1; 1 }; !a || setX(); x"
      )
    ).toBe(1);
  });

  it("throws when ! is applied to non-number operand", () => {
    expect(() => interpret("let x = 1; let p = &x; !p")).toThrow(
      "Logical operands must be numbers"
    );
  });
});
