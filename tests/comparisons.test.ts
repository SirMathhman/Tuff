import { interpret } from "../src/interpret";

describe("interpret - comparisons and equality (numeric)", () => {
  it("supports greater-than > returning 1 for true", () => {
    expect(interpret("let x = 100; let y = 50; x > y")).toBe(1);
  });

  it("supports greater-or-equal >= when equal", () => {
    expect(interpret("let x = 5; let y = 5; x >= y")).toBe(1);
  });

  it("supports less-or-equal <= returning 0 when false", () => {
    expect(interpret("2 <= 1")).toBe(0);
  });

  it("supports numeric equality ==", () => {
    expect(interpret("10 == 10")).toBe(1);
  });

  it("supports numeric inequality !=", () => {
    expect(interpret("10 != 9")).toBe(1);
  });

  it("supports boolean equality and treats booleans as 1/0", () => {
    expect(interpret("true == true")).toBe(1);
  });

  it("compares boolean as numbers for relational ops (true < false -> 0)", () => {
    expect(interpret("true < false")).toBe(0);
  });

  it("supports equality between typed and untyped numbers", () => {
    expect(interpret("1U8 == 1")).toBe(1);
  });

  it("supports ordering between typed numbers", () => {
    expect(interpret("1U8 < 2U8")).toBe(1);
  });

  it("documents chaining behavior 1 < 2 < 3 -> 0", () => {
    expect(interpret("1 < 2 < 3")).toBe(0);
  });

  it("documents chaining behavior 0 < 1 < 2 -> 1", () => {
    expect(interpret("0 < 1 < 2")).toBe(1);
  });

  it("uses equality in if condition (true path)", () => {
    expect(interpret("if (1 == 1) 10 else 20")).toBe(10);
  });

  it("uses inequality in if condition (false path)", () => {
    expect(interpret("if (1 != 1) 10 else 20")).toBe(20);
  });
});

describe("interpret - comparisons and equality (errors)", () => {
  it("resolves pointer identifier usage to NaN (so comparisons should throw)", () => {
    const res = interpret("let x = 1; let p = &x; p");
    expect(Number.isNaN(res as number)).toBe(true);
  });

  it("throws when comparing pointers (parenthesized)", () => {
    expect(() => interpret("let x = 1; let p = &x; (p == p)")).toThrow(
      "Comparison operands must be numbers"
    );
  });

  it("throws when comparing structs (parenthesized)", () => {
    expect(() =>
      interpret(
        "struct S { a : I32 } let a : S = { 1 }; let b : S = { 1 }; (a == b)"
      )
    ).toThrow("Comparison operands must be numbers");
  });
});
