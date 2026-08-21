import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test("index runs without throwing", async () => {
  await import("./index.ts");
  expect(true).toBe(true);
});

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});
