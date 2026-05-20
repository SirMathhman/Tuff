import { test, expect } from "@jest/globals";

import { compile } from "../src";

export function run(source, stdIn) {
  const compiled = compile(source);
  return new Function("stdIn", compiled)(stdIn);
}

test("empty input returns 0", () => {
  expect(run("", "")).toBe(0);
});
test("whitespace input returns 0", () => {
  expect(run(" ", "")).toBe(0);
});
test("read<U8>() reads a number from stdin", () => {
  expect(run("read<U8>()", "100")).toBe(100);
});
