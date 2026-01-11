import { interpret } from "../src/interpret";

describe("interpret - parsing & ranges", () => {
  it("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses integer with trailing text (e.g., '100U8') to number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("throws when unsigned type value is out of range (e.g., '256U8')", () => {
    expect(() => interpret("256U8")).toThrow(Error);
  });

  it("supports U8 ranges", () => {
    expect(interpret("0U8")).toBe(0);
    expect(interpret("255U8")).toBe(255);
    expect(() => interpret("256U8")).toThrow(Error);
  });

  it("supports I8 ranges", () => {
    expect(interpret("127I8")).toBe(127);
    expect(interpret("-128I8")).toBe(-128);
    expect(() => interpret("128I8")).toThrow(Error);
    expect(() => interpret("-129I8")).toThrow(Error);
  });

  it("supports U32 and I32 ranges", () => {
    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(() => interpret("4294967296U32")).toThrow(Error);
    expect(interpret("2147483647I32")).toBe(2147483647);
    expect(() => interpret("2147483648I32")).toThrow(Error);
  });

  it("supports U64/I64 within JS safe integer and rejects unsafe values", () => {
    // max safe integer
    expect(interpret("9007199254740991U64")).toBe(9007199254740991);
    expect(() => interpret("9007199254740992U64")).toThrow(Error);
    expect(interpret("9007199254740991I64")).toBe(9007199254740991);
    // a large I64 exceeding JS safe integer should be rejected
    expect(() => interpret("9223372036854775807I64")).toThrow(Error);
  });

  it("throws when negative number has trailing text (e.g., '-1U8')", () => {
    expect(() => interpret("-1U8")).toThrow(Error);
  });
});

describe("interpret - arithmetic", () => {
  it("adds two typed integers", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("adds multiple typed integers", () => {
    expect(interpret("1U8 + 2U8 + 3U8")).toBe(6);
  });

  it("throws when mixed widths are added", () => {
    expect(() => interpret("1U8 + 2U16 + 3U8")).toThrow(Error);
  });

  it("handles mixed + and - operations", () => {
    expect(interpret("10U8 - 5U8 + 3U8")).toBe(8);
  });

  it("throws when unsigned subtraction underflows", () => {
    expect(() => interpret("1U8 - 2U8")).toThrow(Error);
  });

  it("multiplies with precedence over addition", () => {
    expect(interpret("10 * 5 + 3")).toBe(53);
  });

  it("respects precedence: addition after multiplication", () => {
    expect(interpret("3 + 10 * 5")).toBe(53);
  });

  it("supports parentheses for grouping", () => {
    expect(interpret("(3 + 1) * 2")).toBe(8);
  });

  it("supports brace grouping as parentheses", () => {
    expect(interpret("(3 + { 1 }) * 2")).toBe(8);
  });

  it("throws on division by zero", () => {
    expect(() => interpret("10 / 0")).toThrow(Error);
  });

  it("throws on division by zero with parenthesized denominator", () => {
    expect(() => interpret("10 / (2 - 2)")).toThrow(Error);
  });
});
describe("interpret - blocks (core)", () => {
  it("supports brace grouping as parentheses in expressions", () => {
    expect(interpret("(3 + { 1 }) * 2")).toBe(8);
  });

  it("supports blocks with declarations and returns last expression", () => {
    expect(interpret("(3 + { let x : I32 = 1; x }) * 2")).toBe(8);
  });

  it("evaluates a top-level block and returns the last expression", () => {
    expect(interpret("let x : I32 = 100; x")).toBe(100);
  });

  it("supports mutable declarations and assignment", () => {
    expect(interpret("let mut x = 0; x = 100; x")).toBe(100);
  });

  it("throws when assigning to an immutable variable", () => {
    expect(() => interpret("let x = 0; x = 100; x")).toThrow(Error);
  });

  it("supports Bool declarations and boolean literals", () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
    expect(interpret("let y : Bool = false; y")).toBe(0);
  });

  it("throws when assigning a Bool to an integer-typed declaration", () => {
    expect(() => interpret("let x = true; let y : I32 = x; ")).toThrow(Error);
  });

  it("allows assignment to an uninitialized annotated variable and returns the value", () => {
    expect(interpret("let x : Bool; x = true; x")).toBe(1);
  });

  it("throws when assigning twice to an uninitialized annotated variable", () => {
    expect(() => interpret("let x : Bool; x = true; x = false; x")).toThrow(
      Error
    );
  });
});

describe("interpret - blocks (expressions)", () => {
  it("allows multiple assignments to a `mut` annotated variable", () => {
    expect(interpret("let mut x : Bool; x = true; x = false; x")).toBe(0);
  });

  it("supports conditional assignments using if/else on annotated variable", () => {
    expect(interpret("let x : I32; if (true) x = 10; else x = 20; x")).toBe(10);
  });

  it("supports simple if expressions in initializers", () => {
    expect(interpret("let value : I32 = if (true) 300 else 200; value")).toBe(
      300
    );
  });

  it("supports nested else-if chains in if-expressions", () => {
    expect(
      interpret(
        "let value : I32 = if (true) 300 else if (true) 200 else 100; value"
      )
    ).toBe(300);
  });

  it("supports match expressions with case/_ arms returning a value", () => {
    expect(
      interpret(
        "let result : I32 = match (100) { case 100 => 2; case _ => 3; }; result"
      )
    ).toBe(2);
  });
});

describe("interpret - blocks (expressions extras)", () => {
  it("supports comparison operator < returning boolean as 1/0", () => {
    expect(interpret("let x = 100; let y = 200; x < y")).toBe(1);
    expect(interpret("let x = 100; let y = 50; x < y")).toBe(0);
  });

  it("supports compound assignment '+=' for mutable variables", () => {
    expect(interpret("let mut x = 0; x += 100; x")).toBe(100);
  });

  it("throws when using '+=' on an immutable variable", () => {
    expect(() => interpret("let x = 0; x += 100; x")).toThrow(Error);
  });

  it("throws when using '+=' on an uninitialized annotated variable", () => {
    expect(() => interpret("let x : I32; x += 5; x")).toThrow(Error);
  });

  it("supports while loops with compound-assignment bodies", () => {
    expect(interpret("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
    expect(interpret("let mut y = 0; while (y < 4) { y += 1; } y")).toBe(4);
  });

  it("supports for-loops with range header and inline body", () => {
    expect(
      interpret("let mut sum = 0; for (let mut i in 0..10) sum += i; sum")
    ).toBe(45);
    expect(interpret("let mut s = 0; for (let i in 0..5) { s += i; } s")).toBe(
      10
    );
  });

  it("does not leak for-loop variable to outer scope", () => {
    expect(() => interpret("for (let i in 0..3) {} ; i")).toThrow(Error);

    // if an outer binding exists it should be preserved
    expect(interpret("let mut i = 100; for (let i in 0..2) {} ; i")).toBe(100);
  });

  it("supports function definitions and calls", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) : I32 => first + second; add(1, 2)"
      )
    ).toBe(3);

    expect(
      interpret(
        "fn add(first : I32, second : I32) => { first + second } add(1, 2)"
      )
    ).toBe(3);
  });
});

describe("interpret - block errors", () => {
  it("throws when a block ends with declaration and no expression", () => {
    expect(() => interpret("(3 + { let x : I32 = 1; }) * 2")).toThrow(Error);
  });

  it("throws when a block contains duplicate declarations", () => {
    expect(() =>
      interpret("(3 + { let x : I32 = 1; let x : I32 = 100; x }) * 2")
    ).toThrow(Error);
  });
});

describe("interpret - block scoping", () => {
  it("reflects assignments inside inner blocks for mutable variables", () => {
    expect(interpret("let mut x = 10; { x = 20; } x")).toBe(20);
  });

  it("does not leak block-local declarations to outer scope", () => {
    expect(() => interpret("{ let mut x = 10; } x = 20; x")).toThrow(Error);
  });
});
