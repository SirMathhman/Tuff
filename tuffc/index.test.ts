import { test, expect, describe } from "bun:test";
import { compileTuffToTS } from ".";
import ts from "typescript";

function assertValid(tuffSource: string, expectedExitCode: number, stdIn = "") {
  const tsSource = compileTuffToTS(tuffSource);
  const jsSource = ts.transpile(tsSource, { module: ts.ModuleKind.CommonJS });
  const actualExitCode = new Function("stdIn", jsSource)(stdIn);
  expect(actualExitCode).toBe(expectedExitCode);
}

function assertInvalid(tuffSource: string) {
  expect(() => compileTuffToTS(tuffSource)).toThrow();
}

describe("The compiler", () => {
  test("should handle an empty program", () => {
    assertValid(``, 0);
  });

  test("should handle read<U8>()", () => {
    assertValid("read<U8>()", 100, "100");
  });
});