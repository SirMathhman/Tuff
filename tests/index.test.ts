import { compile } from "../src";

function execute(target: string, stdIn: string): number {
  // Use Function constructor to execute compiled code
  // The compiled code should return the exit code
  try {
    const fn = new Function("stdIn", `return ${target}`);
    return fn(stdIn);
  } catch {
    throw new Error("Failed to execute compiled code");
  }
}

export function validate(source: string, exitCode: number, stdIn: string = "") {
  const compiled = compile(source);
  const actualExitCode = execute(compiled, stdIn);
  expect(actualExitCode).toBe(exitCode);
}

describe("The compiler", () => {
  it("compiles an empty program", () => {
    validate("0", 0);
  });

  it("reads a U8 from stdin", () => {
    validate("read U8", 100, "100");
  });

  it("adds two U8 values from stdin", () => {
    validate("read U8 + read U8", 100, "25, 75");
  });
});
