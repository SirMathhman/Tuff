import { compile } from ".";
import { Ok } from "./result";
import { expect, test } from "bun:test";

function run(source: string, stdIn = "") {
  const compiledJS = compile(source);
  if (compiledJS instanceof Ok) {
    return new Function("stdIn", compiledJS.value)(stdIn);
  } else {
    expect(compiledJS.error).toBeUndefined();
  }
}

test("run(empty string) => 0", () => {
  expect(run("")).toBe(0);
});

test('run(" ") => 0', () => {
  expect(run(" ")).toBe(0);
});
