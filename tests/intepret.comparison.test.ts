import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

describe("intepret - comparison operators", () => {
  it("parses and evaluates less than operator like 'let x : U8 = 100U8; let y : U8 = 200U8; x < y'", () => {
    const result = intepret("let x : U8 = 100U8; let y : U8 = 200U8; x < y");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates greater than operator like '200 > 100'", () => {
    const result = intepret("200 > 100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates less than or equal operator like '100 <= 100'", () => {
    const result = intepret("100 <= 100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates greater than or equal operator like '200 >= 100'", () => {
    const result = intepret("200 >= 100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates equality operator like '100 == 100'", () => {
    const result = intepret("100 == 100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates inequality operator like '100 != 200'", () => {
    const result = intepret("100 != 200");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("returns 0 for false comparison like '200 < 100'", () => {
    const result = intepret("200 < 100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("returns err for comparison on boolean types like 'true < false'", () => {
    const result = intepret("true < false");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("type");
  });

  it("parses and evaluates comparison in if-else like 'if (100 < 200) 10 else 20'", () => {
    const result = intepret("if (100 < 200) 10 else 20");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });
});
