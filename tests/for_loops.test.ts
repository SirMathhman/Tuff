import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("for loops - basic", () => {
  it("should iterate from 0 to 9 and sum values", () => {
    expect(
      interpret("let mut sum = 0; for(let mut i in 0..10) sum += i; sum")
    ).toBe(45);
  });

  it("should work with single iteration", () => {
    expect(interpret("let mut x = 0; for(let mut i in 0..1) x = i; x")).toBe(0);
  });

  it("should support different range starts", () => {
    expect(
      interpret("let mut sum = 0; for(let mut i in 5..8) sum += i; sum")
    ).toBe(18); // 5 + 6 + 7 = 18
  });

  it("should support large ranges", () => {
    expect(
      interpret("let mut sum = 0; for(let mut i in 0..100) sum += i; sum")
    ).toBe(4950); // sum 0 to 99
  });

  it("should allow using loop variable in calculations", () => {
    expect(
      interpret("let mut sum = 0; for(let mut i in 0..5) sum += i * 2; sum")
    ).toBe(20); // (0*2) + (1*2) + (2*2) + (3*2) + (4*2) = 20
  });

  it("should handle empty range (same start and end)", () => {
    expect(
      interpret("let mut sum = 0; for(let mut i in 5..5) sum += i; sum")
    ).toBe(0);
  });
});

describe("for loops - advanced", () => {
  it("should allow mutation inside loop", () => {
    expect(
      interpret(
        "let mut x = 0; for(let mut i in 0..3) { let mut y = i; y += 10; x += y }; x"
      )
    ).toBe(33); // (0+10) + (1+10) + (2+10) = 33
  });

  it("should work with if conditions in loop", () => {
    expect(
      interpret(
        "let mut sum = 0; for(let mut i in 0..10) { if(i % 2 == 0) sum += i }; sum"
      )
    ).toBe(20); // 0 + 2 + 4 + 6 + 8 = 20
  });

  it("should preserve outer scope variables", () => {
    expect(
      interpret("let mut x = 100; for(let mut i in 0..3) { let mut y = i }; x")
    ).toBe(100);
  });

  it("should work with explicit braces around body", () => {
    expect(
      interpret("let mut sum = 0; for(let mut i in 0..5) { sum += i }; sum")
    ).toBe(10); // 0 + 1 + 2 + 3 + 4 = 10
  });
});
