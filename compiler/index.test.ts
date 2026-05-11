import { test, expect } from "bun:test";
import { compileTuffToTS } from "./index";
import ts from "typescript";

function assertValid(
  tuffSourceCode: string,
  expectedExitCode: number,
  stdIn = "",
) {
  const compiledTS = compileTuffToTS(tuffSourceCode);
  const compiledJS = ts.transpile(compiledTS, {
    module: ts.ModuleKind.CommonJS,
  });
  const actualExitCode = new Function("stdIn", compiledJS)(stdIn);
  expect(actualExitCode).toBe(expectedExitCode);
}

function assertInvalid(tuffSourceCode: string) {
  expect(() => compileTuffToTS(tuffSourceCode)).toThrow();
}

test("The simplest possible program", () => {
  assertValid(``, 0);
});

test("A program with a syntax error", () => {
  assertInvalid(`this is not valid tuff code`);
});

test("read<U8>() parses stdin as unsigned 8-bit integer", () => {
  assertValid("read<U8>()", 100, "100");
});

