import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - control flow", () => {
  it("supports boolean literal true", () => {
    expect(interpret("true")).toBe(1);
  });

  it("supports boolean literal false", () => {
    expect(interpret("false")).toBe(0);
  });

  it("supports boolean variable declarations with Bool type", () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
  });

  it("supports boolean variable with false", () => {
    expect(interpret("let y : Bool = false; y")).toBe(0);
  });

  it("supports if-else expression with true condition", () => {
    expect(interpret("if (true) 3 else 4")).toBe(3);
  });

  it("supports if-else expression with false condition", () => {
    expect(interpret("if (false) 3 else 4")).toBe(4);
  });

  it("supports if-else in variable declaration", () => {
    expect(interpret("let x : I32 = if (true) 3 else 4; x")).toBe(3);
  });

  it("supports if-else with arithmetic", () => {
    expect(interpret("if (1 + 1 > 1) 10 else 20")).toBe(10);
  });

  it("supports nested if-else-if-else expressions", () => {
    expect(
      interpret("let x : I32 = if (true) 3 else if (false) 4 else 5; x"),
    ).toBe(3);
  });

  it("supports match expression with literal pattern", () => {
    expect(
      interpret("let x : I32 = match (100) { case 100 => 3; case _ => 2; } x"),
    ).toBe(3);
  });

  it("supports loop expression with break", () => {
    expect(interpret("let x : I32 = loop { break 5; }; x")).toBe(5);
  });

  it("supports loop with break inside if condition", () => {
    expect(interpret("let x : I32 = loop { if (true) break 5; }; x")).toBe(5);
  });

  it("supports compound assignment and loop with break value", () => {
    expect(
      interpret("let mut i = 0; loop { if (i < 4) i += 1; else break i; }"),
    ).toBe(4);
  });

  it("supports while loop with condition and increment", () => {
    expect(interpret("let mut i = 0; while (i < 4) i += 1; i")).toBe(4);
  });

  it("supports for-in loop with range", () => {
    expect(
      interpret("let mut sum = 0; for (let mut i in 0..10) sum += i; sum"),
    ).toBe(45);
  });
});
