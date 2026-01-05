import { interpret } from "../src/interpret";

describe("interpret", () => {
  test("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  test("evaluates simple addition expression", () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  test("evaluates multiplication and parentheses", () => {
    expect(interpret("2*(3+4)/2")).toBe(7);
  });

  test("handles decimals and unary minus", () => {
    expect(interpret("3.5 + 1.5")).toBe(5);
    expect(interpret("-1 + 2")).toBe(1);
  });
});
