import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

function executeTuff(tuffSource: string, args: string[] = []): number {
  const generatedJS = compileTuffToJS("in let args; " + tuffSource);

  let exitCode = 0;
  const process = {
    exit(value: number) {
      exitCode = value;
    },
  };

  new Function("process", "args", generatedJS)(process, args);
  return exitCode;
}

test('executeTuff("") => 0', () => {
  expect(executeTuff("")).toBe(0);
});
