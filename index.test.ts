import { test, expect } from "bun:test";
import { evaluate } from "./index.ts";

test('evaluate("") => error', () => {
  expect(evaluate("")).toEqual({
    ok: false,
    error: { kind: "empty", message: "empty input", position: 0 },
  });
});
