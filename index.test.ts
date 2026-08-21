import { expect, test } from "bun:test";
import { evaluate } from "./index.ts";

test("index runs without throwing", async () => {
  await import("./index.ts");
  expect(true).toBe(true);
});

test('evaluate("") => 0', () => {
  const r = evaluate("");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(0);
});

test('evaluate("1") => 1', () => {
  const r = evaluate("1");
  if (!r.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(r.error)}`);
  expect(r.value).toBe(1);
});

test('evaluate("abc") => invalid_input error', () => {
  const r = evaluate("abc");
  if (r.ok) throw new Error(`expected error, got ok: ${r.value}`);
  if (r.error.kind !== "invalid_input")
    throw new Error(`expected kind "invalid_input", got: ${JSON.stringify(r.error)}`);
});
