import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test("index runs without throwing", async () => {
  await import("./index.ts");
  expect(true).toBe(true);
});

test('evaluate("") => 0', () => {
  const r = evaluate("");
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toBe(0);
});

test('evaluate("1") => 1', () => {
  const r = evaluate("1");
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toBe(1);
});

test('evaluate("abc") => invalid_input error', () => {
  const r = evaluate("abc");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe("invalid_input");
});
