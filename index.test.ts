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
  const result = compileTuffToTypeScript(PRELUDE + tuffSource);
  if (!result.ok) {
    throw new Error("Compilation failed: " + result.error.message);
  }
  const compiledJS = ts.transpile(result.value);

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
  const result = compileTuffToTypeScript(PRELUDE + tuffSource);
  expect(result.ok).toBe(false);
}

test("empty source", () => {
  expectValid("", 0, []);
});

test("args.length", () => {
  expectValid("args.length", 1, []);
});

test("args.length + 1", () => {
  expectValid("args.length + 1", 2, []);
});

test("let x = args; x.length", () => {
  expectValid("let x = args; x.length", 1, []);
});

test("let x = args; let y = x; y.length", () => {
  expectValid("let x = args; let y = x; y.length", 1, []);
});

test("let mut x = 0; x = args.length; x", () => {
  expectValid("let mut x = 0; x = args.length; x", 1, []);
});

test("string literal containing 'let mut' survives", () => {
  expectValid('let msg = "let mut x"; msg.length', 9, []);
});

test("reassign immutable variable is an error", () => {
  expectInvalid("let x = 0; x = args.length; x");
});

test("let x = 1; let y = &x; *y", () => {
  expectValid("let x = 1; let y = &x; *y", 1, []);
});

test("string literal containing '&' survives", () => {
  expectValid('let msg = "a & b"; msg.length', 5, []);
});

test("unbalanced parens", () => {
  expectInvalid("args.length (");
});
