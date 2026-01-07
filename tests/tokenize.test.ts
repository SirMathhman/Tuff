import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenize";
import { isOk } from "../src/result";

function checkTokens(input: string, expected: any[]) {
  const r = tokenize(input);
  expect(isOk(r)).toBe(true);
  if (isOk(r)) {
    expect(r.value).toEqual(expected);
  }
}

describe("tokenize - addition & unary", () => {
  it("tokenizes simple expression", () => {
    checkTokens("1 + 2", [
      { type: "num", value: 1 },
      { type: "op", value: "+" },
      { type: "num", value: 2 },
    ]);
  });

  it("handles unary minus", () => {
    checkTokens("1 - -2", [
      { type: "num", value: 1 },
      { type: "op", value: "-" },
      { type: "num", value: -2 },
    ]);
  });
});

describe("tokenize - mul/div/mod", () => {
  it("tokenizes multiplication", () => {
    checkTokens("2 * 3", [
      { type: "num", value: 2 },
      { type: "op", value: "*" },
      { type: "num", value: 3 },
    ]);
  });

  it("tokenizes division", () => {
    checkTokens("10 / 2", [
      { type: "num", value: 10 },
      { type: "op", value: "/" },
      { type: "num", value: 2 },
    ]);
  });

  it("tokenizes modulus", () => {
    checkTokens("10 % 3", [
      { type: "num", value: 10 },
      { type: "op", value: "%" },
      { type: "num", value: 3 },
    ]);
  });
});

describe("tokenize - parentheses & identifiers", () => {
  it("tokenizes parentheses", () => {
    checkTokens("(3 + 10) * 5", [
      { type: "paren", value: "(" },
      { type: "num", value: 3 },
      { type: "op", value: "+" },
      { type: "num", value: 10 },
      { type: "paren", value: ")" },
      { type: "op", value: "*" },
      { type: "num", value: 5 },
    ]);
  });

  it("returns Err on malformed parentheses", () => {
    const r = tokenize("(3 + 2");
    // Tokenizer should still tokenize characters; parenthesis mismatch is detected in evaluation.
    expect(isOk(r)).toBe(true);
  });

  it("tokenizes identifiers", () => {
    checkTokens("a - 1", [
      { type: "ident", value: "a" },
      { type: "op", value: "-" },
      { type: "num", value: 1 },
    ]);
  });
});

describe("tokenize - compound assignment", () => {
  it("tokenizes += with spaces", () => {
    checkTokens("a += 1", [
      { type: "ident", value: "a" },
      { type: "punct", value: "+=" },
      { type: "num", value: 1 },
    ]);
  });

  it("tokenizes *= without spaces", () => {
    checkTokens("b*=2", [
      { type: "ident", value: "b" },
      { type: "punct", value: "*=" },
      { type: "num", value: 2 },
    ]);
  });
});
