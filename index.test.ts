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
  assertValid("", 0);
});
