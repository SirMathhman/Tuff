import { describe, it } from "vitest";
import { interpret } from "../src/interpret";
import { expectOkValue } from "../src/testUtils";

describe("interpret - while loops with block body", () => {
  it("executes loop body while condition is true", () => {
    const r = interpret("let mut i : I32 = 0; while (i < 3) { i = i + 1; }; i");
    expectOkValue(r, 3);
  });

  it("skips loop body when condition is false", () => {
    const r = interpret(
      "let mut i : I32 = 10; while (i < 5) { i = i + 1; }; i"
    );
    expectOkValue(r, 10);
  });

  it("executes multiple iterations with mutations", () => {
    const r = interpret(
      "let mut x : I32 = 1; while (x < 100) { x = x * 2; }; x"
    );
    expectOkValue(r, 128);
  });

  it("supports multiple variables in loop", () => {
    const r = interpret(
      "let mut i : I32 = 0; let mut sum : I32 = 0; while (i < 5) { sum = sum + i; i = i + 1; }; sum"
    );
    expectOkValue(r, 10);
  });

  it("handles nested loops", () => {
    const r = interpret(
      "let mut i : I32 = 0; let mut j : I32 = 0; while (i < 3) { j = 0; while (j < 2) { j = j + 1; }; i = i + 1; }; i"
    );
    expectOkValue(r, 3);
  });

  it("supports complex condition with comparisons", () => {
    const r = interpret(
      "let mut x : I32 = 5; while (x > 0 && x < 10) { x = x + 1; }; x"
    );
    expectOkValue(r, 10);
  });

  it("loop variable persists after loop", () => {
    const r = interpret(
      "let mut x : I32 = 0; while (x < 5) { x = x + 1; }; x + 10"
    );
    expectOkValue(r, 15);
  });
});

describe("interpret - while loops with single-statement body", () => {
  it("executes single statement body repeatedly", () => {
    const r = interpret("let mut i : I32 = 0; while (i < 3) i = i + 1; i");
    expectOkValue(r, 3);
  });

  it("supports block expression in single statement body", () => {
    const r = interpret("let mut x : I32 = 0; while (x < 2) x = { x + 1 }; x");
    expectOkValue(r, 2);
  });

  it("single statement with complex expression", () => {
    const r = interpret("let mut i : I32 = 1; while (i < 32) i = i * 2; i");
    expectOkValue(r, 32);
  });
});

describe("interpret - while loop edge cases", () => {
  it("zero iterations with false condition", () => {
    const r = interpret(
      "let mut x : I32 = 100; while (x < 50) { x = x - 1; }; x"
    );
    expectOkValue(r, 100);
  });

  it("single iteration", () => {
    const r = interpret("let mut x : I32 = 0; while (x < 1) { x = x + 1; }; x");
    expectOkValue(r, 1);
  });

  it("condition becomes false during iteration", () => {
    const r = interpret(
      "let mut x : I32 = 10; while (x > 0) { x = x - 1; }; x"
    );
    expectOkValue(r, 0);
  });

  it("loop with modulus operator in condition", () => {
    const r = interpret(
      "let mut x : I32 = 1; while (x % 3 != 0) { x = x + 1; }; x"
    );
    expectOkValue(r, 3);
  });
});

describe("interpret - while loops with variable initialization", () => {
  it("uses uninitialized variable in loop", () => {
    const r = interpret(
      "let mut x : I32; x = 0; while (x < 3) { x = x + 1; }; x"
    );
    expectOkValue(r, 3);
  });

  it("variable initialized in block before loop", () => {
    const r = interpret(
      "{ let mut i : I32 = 0; while (i < 2) { i = i + 1; }; i }"
    );
    expectOkValue(r, 2);
  });
});

describe("interpret - while loops in expressions", () => {
  it("while loop followed by arithmetic", () => {
    const r = interpret(
      "let mut x : I32 = 0; while (x < 5) { x = x + 1; }; x * 2"
    );
    expectOkValue(r, 10);
  });

  it("multiple statements after while loop", () => {
    const r = interpret(
      "let mut i : I32 = 0; while (i < 3) { i = i + 1; }; let result : I32 = i * 2; result"
    );
    expectOkValue(r, 6);
  });

  it("while loop in larger program", () => {
    const r = interpret(
      "let mut sum : I32 = 0; let mut i : I32 = 1; while (i <= 4) { sum = sum + i; i = i + 1; }; sum"
    );
    expectOkValue(r, 10);
  });
});
