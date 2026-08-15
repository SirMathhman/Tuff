import { test, expect } from "bun:test";
import { interpret } from "./index.ts";

test('interpret("") => 0', () => {
  expect(interpret("")).toBe(0);
});
