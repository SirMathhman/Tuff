import { describe, it, expect } from "vitest";
import { evalLeftToRight } from "../src/evalLeftToRight";
import { isErr } from "../src/result";
import { expectOkValue } from "../src/utils/testUtils";

// Helper to build token arrays more concisely
function mkTokens(spec: Array<number | string>): any[] {
  const result: any[] = [];
  for (const item of spec) {
    if (typeof item === "number") {
      result.push({ type: "num", value: item } as const);
    } else if (item === "(" || item === ")") {
      result.push({ type: "paren", value: item });
    } else {
      result.push({ type: "op", value: item } as const);
    }
  }
  return result;
}

describe("evalLeftToRight - addition/subtraction", () => {
  it("evaluates left-to-right", () => {
    expectOkValue(evalLeftToRight(mkTokens([10, "-", 5, "+", 3]) as any), 8);
  });
});

describe("evalLeftToRight - multiplication", () => {
  it("evaluates multiplication with precedence", () => {
    expectOkValue(evalLeftToRight(mkTokens([10, "*", 5, "+", 3]) as any), 53);
  });

  it("evaluates chained multiplication", () => {
    expectOkValue(evalLeftToRight(mkTokens([2, "*", 3, "*", 4]) as any), 24);
  });
});

describe("evalLeftToRight - division & modulus", () => {
  it("evaluates division and chained division", () => {
    expectOkValue(evalLeftToRight(mkTokens([100, "/", 2, "/", 5]) as any), 10);
    expectOkValue(evalLeftToRight(mkTokens([20, "/", 5]) as any), 4);
  });

  it("evaluates modulus and chained modulus", () => {
    expectOkValue(evalLeftToRight(mkTokens([10, "%", 3]) as any), 1);
    expectOkValue(evalLeftToRight(mkTokens([20, "%", 6, "%", 4]) as any), 2);
  });
});

describe("evalLeftToRight - parentheses", () => {
  it("evaluates parentheses grouping", () => {
    expectOkValue(
      evalLeftToRight(mkTokens(["(", 3, "+", 10, ")", "*", 5]) as any),
      65
    );
  });

  it("evaluates nested parentheses", () => {
    expectOkValue(
      evalLeftToRight(
        mkTokens([2, "*", "(", 1, "+", "(", 3, "-", 1, ")", ")"]) as any
      ),
      6
    );
  });
});

describe("evalLeftToRight - errors", () => {
  it("returns Err on invalid token sequence", () => {
    const r = evalLeftToRight([{ type: "op", value: "+" } as any]);
    expect(isErr(r)).toBe(true);
  });

  it("returns Err on empty parentheses", () => {
    const tokens = [
      { type: "paren", value: "(" } as any,
      { type: "paren", value: ")" } as any,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isErr(r)).toBe(true);
  });

  it("returns Err on unmatched opening parenthesis", () => {
    const tokens = [
      { type: "paren", value: "(" } as any,
      { type: "num", value: 1 } as const,
    ];
    const r = evalLeftToRight(tokens as any);
    expect(isErr(r)).toBe(true);
  });
});
