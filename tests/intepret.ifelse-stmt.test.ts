import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

describe("intepret - if-else statements", () => {
  it("evaluates if-else statement with side effects like 'let mut x = 0; if (true) x = 1 else x = 2; x'", () => {
    const result = intepret("let mut x = 0; if (true) x = 1 else x = 2; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("evaluates if-else statement else-branch side effects like 'let mut x = 0; if (false) x = 1 else x = 2; x'", () => {
    const result = intepret("let mut x = 0; if (false) x = 1 else x = 2; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(2);
  });
});
