import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

describe("Loop expressions - basic", () => {
  it("evaluates simple loop with break", () => {
    const result = intepret("let mut x = 0; loop { break x; }");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(0);
    }
  });

  it("evaluates loop with counter and break condition", () => {
    const result = intepret(
      "let mut x = 0; let result = loop { if (x < 4) break x; x += 1; }; result",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(0);
    }
  });

  it("evaluates loop with increment before check", () => {
    const result = intepret(
      "let mut x = 0; loop { x += 1; if (x >= 5) break x; }",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(5);
    }
  });

  it("evaluates loop with typed values", () => {
    const result = intepret(
      "let mut x = 0u8; loop { if (x >= 3u8) break x; x += 1u8; }",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(3);
    }
  });
});

describe("Loop expressions - error cases", () => {
  it("returns error for immutable variable modification", () => {
    const result = intepret("let x = 0; loop { x += 1; break x; }");
    expect(isOk(result)).toBe(false);
  });

  it("returns error for loop without break", () => {
    const result = intepret("loop { let x = 1; }");
    expect(isOk(result)).toBe(false);
  });
});

describe("Loop expressions - nested scopes", () => {
  it("evaluates nested variable assignments in loop", () => {
    const result = intepret(
      "let mut x = 0; loop { let y = x + 1; x = y; if (x >= 3) break x; }",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(3);
    }
  });
});
