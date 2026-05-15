import { test, expect } from "bun:test";
import { compile } from ".";
import * as ts from "typescript";

function executeTuff(tuffSourceCode: string, stdIn: string = ""): number {
  const compiledTSCode = compile(tuffSourceCode);
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

test('executeTuff("read<U16>()", "100 20") == 100', () => {
  expect(executeTuff("read<U16>()", "100 20")).toBe(100);
});

test('executeTuff("read<U8>() + read<U8>()", "1 2") == 3', () => {
  expect(executeTuff("read<U8>() + read<U8>()", "1 2")).toBe(3);
});

test('executeTuff("read<U8>() + read<U8>() + read<U8>()", "1 2 3") == 6', () => {
  expect(executeTuff("read<U8>() + read<U8>() + read<U8>()", "1 2 3")).toBe(6);
});

test('executeTuff("let x : U8 = read<U8>(); x", "2") == 2', () => {
  expect(executeTuff("let x : U8 = read<U8>(); x", "2")).toBe(2);
});

test('executeTuff("let x : U8 = read<U8>(); x + x", "2") == 4', () => {
  expect(executeTuff("let x : U8 = read<U8>(); x + x", "2")).toBe(4);
});

test('executeTuff("let x = read<U8>(); x + x", "2") == 4', () => {});
