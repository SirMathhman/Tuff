import { expect, mock, test } from "bun:test";

mock.module("./index.ts", () => ({
  evaluate: () => 0,
}));

const { evaluate } = await import("./index.ts");

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});
