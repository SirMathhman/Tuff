import { interpret } from "../src/index";

test("interpret returns number for numeric return", () => {
  // compile is identity for now; provide JS directly that returns a number
  expect(interpret("return 42;")).toBe(42);
});

test("interpret returns NaN for non-numeric output", () => {
  expect(Number.isNaN(interpret("return 'not-a-number';"))).toBe(true);
});
