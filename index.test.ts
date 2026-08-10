import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

function expectValid(
  tuffSource: string,
  expectedExitCode: number,
  args: string[] = [],
) {
  const generatedJS = compileTuffToJS(tuffSource);

  try {
    let actualExitCode = 0;
    let process = {
      exit(arg: number) {
        actualExitCode = arg;
      },
    };

    new Function("process", "args", generatedJS)(process, args);

    if (actualExitCode !== expectedExitCode) {
      throw new Error(
        "Expected exit code '" +
          expectValid +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: '" +
          generatedJS +
          "'",
      );
    }
  } catch (e) {
    throw new Error(
      "Failed to execute generated code: '" + generatedJS + "'. Cause: " + e,
    );
  }
}

function expectInvalid(tuffSource: string) {
  expect(() => compileTuffToJS(tuffSource)).toThrow();
}

test("expectValid empty string", () => {
  expectValid("", 0);
});

