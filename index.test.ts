import { test, expect } from "bun:test";
import * as ts from "typescript";
import { compile } from ".";

function execute(source: string, stdIn = "") {
  const compiled = compile(source);
  const result = ts.transpileModule(compiled, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
    },
  });
  return new Function("stdIn", result.outputText)(stdIn);
}

test("empty string", () => {
  expect(execute("")).toBe(0);
});
