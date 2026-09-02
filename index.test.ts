import { test, expect } from "bun:test";
import { compileTuffToTypeScript } from ".";
import ts from "typescript";

const PRELUDE = `
module NodeJS {
  declare type Process;
  declare fn exit(this : Process, code : I32) : Void;
}

declare let process : NodeJS::Process;

in let args : *[*Str];
`;
export function expectValid(
  tuffSource: string,
  expectedExitCode: number,
  args: string[] = [],
) {
  const compiledTS = compileTuffToTypeScript(PRELUDE + tuffSource);
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

test("args.length", () => {
  expectValid("args.length", 1, []);
});
