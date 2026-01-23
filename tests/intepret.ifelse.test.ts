import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

describe("intepret - expressions: if-else", () => {
  it("parses and evaluates if-else like 'if (true || false) 3 else 5'", () => {
    const result = intepret("if (true || false) 3 else 5");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(3);
  });

  it("evaluates then-branch like 'let x = if (true) 10 else 20; x'", () => {
    const result = intepret("let x = if (true) 10 else 20; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });

  it("evaluates else-branch like 'let x = if (false) 10 else 20; x'", () => {
    const result = intepret("let x = if (false) 10 else 20; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(20);
  });

  it("evaluates with variable condition like 'let cond = true; if (cond) 100 else 200'", () => {
    const result = intepret("let cond = true; if (cond) 100 else 200");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("supports nested if-else like 'if (true) if (false) 1 else 2 else 3'", () => {
    const result = intepret("if (true) if (false) 1 else 2 else 3");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(2);
  });

  it("returns err for numeric literal condition like 'if (100) 2 else 3'", () => {
    const result = intepret("if (100) 2 else 3");
    expect(isOk(result)).toBe(false);
  });

  it("returns err for numeric variable condition like 'let x = 100; if (x) 2 else 3'", () => {
    const result = intepret("let x = 100; if (x) 2 else 3");
    expect(isOk(result)).toBe(false);
  });

  it("returns err for mismatched branch types like 'let x : Bool = false; let y : I32 = if ( true ) x else 100; y'", () => {
    const result = intepret(
      "let x : Bool = false; let y : I32 = if ( true ) x else 100; y",
    );
    expect(isOk(result)).toBe(false);
  });
});
