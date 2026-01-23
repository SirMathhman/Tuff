import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

describe("intepret - compound assignments", () => {
  it("parses and evaluates compound assignment += like 'let mut x = 0; x += 1; x'", () => {
    const result = intepret("let mut x = 0; x += 1; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates compound assignment -= like 'let mut x = 10; x -= 3; x'", () => {
    const result = intepret("let mut x = 10; x -= 3; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(7);
  });

  it("parses and evaluates compound assignment *= like 'let mut x = 5; x *= 2; x'", () => {
    const result = intepret("let mut x = 5; x *= 2; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });

  it("parses and evaluates compound assignment /= like 'let mut x = 20; x /= 4; x'", () => {
    const result = intepret("let mut x = 20; x /= 4; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(5);
  });
});
