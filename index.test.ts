import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test("index runs without throwing", async () => {
  await import("./index.ts");
  expect(true).toBe(true);
});

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toBe(1);
});
