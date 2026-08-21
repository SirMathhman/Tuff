import { expect, test } from "bun:test";

test("index runs without throwing", async () => {
  await import("./index.ts");
  expect(true).toBe(true);
});
