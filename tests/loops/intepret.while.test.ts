import { describe, it, expect } from "bun:test";
import { intepret } from "../../src/eval/intepret";
import { isOk } from "../../src/core/result";

describe("While expressions - basic", () => {
  it("evaluates simple while loop", () => {
    const result = intepret("let mut x = 0; while (x < 4) x += 1; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(4);
    }
  });

  it("evaluates while loop with block body", () => {
    const result = intepret("let mut x = 0; while (x < 3) { x += 1; } x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(3);
    }
  });

  it("evaluates while loop that never executes", () => {
    const result = intepret("let mut x = 5; while (x < 3) x += 1; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(5);
    }
  });

  it("evaluates while loop with typed values", () => {
    const result = intepret(
      "let mut x = 0u8; while (x < 5u8) x += 1u8; x",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(5);
    }
  });
});

describe("While expressions - complex", () => {
  it("evaluates nested variable declarations in while", () => {
    const result = intepret(
      "let mut x = 0; while (x < 3) { let y = x + 1; x = y; } x",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(3);
    }
  });

  it("evaluates while with multiple statements", () => {
    const result = intepret(
      "let mut x = 0; let mut y = 10; while (x < 3) { x += 1; y += 2; } y",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(16);
    }
  });
});

describe("While expressions - errors", () => {
  it("returns error for immutable variable in while", () => {
    const result = intepret("let x = 0; while (x < 3) x += 1; x");
    expect(isOk(result)).toBe(false);
  });

  it("returns error for non-boolean condition", () => {
    const result = intepret("let mut x = 0; while (5) x += 1; x");
    expect(isOk(result)).toBe(false);
  });
});
