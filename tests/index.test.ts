import { compile } from "../src";

function executeJS(jsCode: string, ...args: string[]): number {
  let exitCode = 0;
  const mockProcess = {
    argv: ["node", "script.js", ...args],
    exit: (code: number) => {
      exitCode = code;
      throw new Error(`exit:${code}`);
    },
  };

  try {
    const func = new Function("process", jsCode);
    func(mockProcess);
  } catch (e: any) {
    if (typeof e.message === "string" && e.message.startsWith("exit:")) {
      exitCode = parseInt(e.message.substring(5), 10);
    } else {
      throw e;
    }
  }

  return exitCode;
}

export function validate(source: string, exitCode: number, ...args: string[]) {
  const compiled = compile(source);
  const actualExitCode = executeJS(compiled, ...args);
  expect(actualExitCode).toBe(exitCode);
}

describe("The compiler", () => {
  it("compiles an empty program", () => {
    validate("0", 0);
  });

  it("reads a U8 from stdin", () => {
    validate("read U8", 100, "100");
  });
});
