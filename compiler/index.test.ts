import { compileTuffToTS } from "./index";
import * as ts from "typescript";
import { test, expect } from "bun:test";

function assertValid(
  source: string,
  expectedExitCode: number,
  stdIn = "",
): void {
  const compiledTS = compileTuffToTS(source);
  const compiledJS = ts.transpile(compiledTS, {
    module: ts.ModuleKind.CommonJS,
  });
  const func = new Function("stdIn", compiledJS);
  const actualExitCode = func(stdIn);
  expect(actualExitCode).toBe(expectedExitCode);
}

test("empty string returns 0", () => {
  assertValid("", 10);
});

test("100U8 should return 100", () => {
  assertValid("100U8", 100);
});

test("read<U8>() should read a byte from stdin", () => {
  assertValid("read<U8>()", 100, "100");
});

test("read<U8>() should read first value and ignore trailing input", () => {
  assertValid("read<U8>()", 100, "100 20");
});

test("read<U8>() + read<U8>() should sum two read values", () => {
  assertValid("read<U8>() + read<U8>()", 120, "100 20");
});

test("read<U8>() + read<U8>() + read<U8>() should sum three read values", () => {
  assertValid("read<U8>() + read<U8>() + read<U8>()", 150, "100 20 30");
});

