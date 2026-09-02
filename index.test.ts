import { test, expect } from "bun:test";
import { compileTuffToTypeScript } from ".";
import ts from "typescript";

export function expectValid(
  tuffSource: string,
  expectedExitCode: number,
  args: string[] = [],
) {
  const compiledTS = compileTuffToTypeScript(tuffSource);
  const compiledJS = ts.transpile(compiledTS);

  let actualExitCode = 0;
  let process = {
    exit(code: number) {
      actualExitCode = code;
    },
  };

  new Function("process", "args", compiledJS)(process, [
    "mock_program_name",
    ...args,
  ]);
  expect(actualExitCode).toBe(expectedExitCode);
}

export function expectInvalid(tuffSource: string) {
  try {
    const compiledTS = compileTuffToTypeScript(tuffSource);
    throw new Error(
      "Expected test to fail but compiled to: '" + compiledTS + "'",
    );
  } catch (e) {}
}

test("empty source", () => {
  expectValid("", 0, []);
});
