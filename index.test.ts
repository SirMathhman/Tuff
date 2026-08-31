import { test, expect } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toEqual({ ok: true, value: 0 });
});
