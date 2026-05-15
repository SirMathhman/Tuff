import { test, expect } from "bun:test";
import { compile, Ok } from ".";
import * as ts from "typescript";

function executeTuff(tuffSourceCode: string, stdIn: string = ""): number {
  const result = compile(tuffSourceCode);
  if (!(result instanceof Ok)) return -1;
  const compiledTSCode = result.value;
  const compiledJSCode = ts.transpile(compiledTSCode);
  return new Function("stdIn", compiledJSCode)(stdIn) as number;
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

function expectErr(src: string): void {
  expect(compile(src) instanceof Ok).toBe(false);
}

test('compile("let x = 0; let x = 0;") => Error', () => {
  expectErr("let x = 0; let x = 0;");
});

test('compile("let x : U8 = 0U16;") => Error', () => {
  expectErr("let x : U8 = 0U16;");
});

test('compile("let x = 0U16; let y : U8 = x;") => Error', () => {
  expectErr("let x = 0U16; let y : U8 = x;");
});
test('executeTuff("let mut x = read<U8>(); x = read<U8>(); x", "100 20") == 20', () => {
  expect(executeTuff("let mut x = read<U8>(); x = read<U8>(); x", "100 20")).toBe(20);
});

test('compile("let x = read<U8>(); x = read<U8>(); x") => Error', () => {
  expectErr("let x = read<U8>(); x = read<U8>(); x");
});

test('executeTuff("let x = { 100U8 }; x", "") == 100', () => {
  expect(executeTuff("let x = { 100U8 }; x", "")).toBe(100);
});

