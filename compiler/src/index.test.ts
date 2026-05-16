import { test, expect } from "bun:test";
import { compile } from ".";

test("run(empty string) => 0", () => {
  const compiled = compile("");
  expect(new Function("stdIn", compiled)("")).toBe(0);
});

test('run("read<U8>()", "100") => 100', () => {
  const compiled = compile("read<U8>()");
  expect(new Function("stdIn", compiled)("100")).toBe(100);
});

test('run("read<U16>()", "100") => 100', () => {
  const compiled = compile("read<U16>()");
  expect(new Function("stdIn", compiled)("100")).toBe(100);
});
