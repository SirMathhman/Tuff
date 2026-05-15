import { test, expect } from "bun:test";
import { compileTuffToTS } from ".";
import * as ts from "typescript";

function executeTuff(tuffSourceCode: string, stdIn: string = ""): number {
  const compiledTSCode = compileTuffToTS(tuffSourceCode);
  const compiledJSCode = ts.transpile(compiledTSCode);
  const result = new Function("stdIn", compiledJSCode)(stdIn);
  if (typeof result !== "number") {
    throw new Error("Not a number!");
  }
  return result;
}

test("executeTuff(empty string) == 0", () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff("read<U8>()", "100") == 100', () => {
  expect(executeTuff("read<U8>()", "100")).toBe(100);
});

test('executeTuff("read<U16>()", "100") == 100', () => {
  expect(executeTuff("read<U16>()", "100")).toBe(100);
});
