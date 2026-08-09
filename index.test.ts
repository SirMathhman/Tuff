import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

const PRELUDE = "in let args : &[&Str]; ";

function executeTuff(tuffSource: string, args: string[] = []): number {
  const jsSource = compileTuffToJS(PRELUDE + tuffSource);
  try {
    return new Function("args", jsSource)(args);
  } catch (e) {
    throw new Error(
      "Failed to execute generated JS: '" + jsSource + "', Cause: " + e,
    );
  }
}

test('executeTuff("") => 0', () => {
  expect(executeTuff("")).toBe(0);
});

test('executeTuff("1") => 1', () => {
  expect(executeTuff("1")).toBe(1);
});
