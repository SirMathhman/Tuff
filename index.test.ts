import { test, expect } from "bun:test";
import { CompileErrorType, compileTuffToJS } from ".";

function expectValid(
  tuffSource: string,
  expectedExitCode: number,
  args: string[] = [],
) {
  const generatedJSResult = compileTuffToJS(tuffSource);
  if (!generatedJSResult.isOk) {
    throw new Error(generatedJSResult.value.message);
  }

  const generatedJS = generatedJSResult.value;

  try {
    let actualExitCode = 0;
    let process = {
      exit(code: number) {
        actualExitCode = code;
      },
    };

    new Function("process", "args", generatedJS)(process, args);

    if (expectedExitCode !== actualExitCode) {
      throw new Error(
        "Expected exit code '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: " +
          generatedJS,
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated JS: '" + generatedJS + "'");
  }
}

function expectInvalid(tuffSource: string, expectedType: CompileErrorType) {
  const result = compileTuffToJS(tuffSource);
  if (result.isOk) {
    throw new Error(
      "Expected a compilation failure but generated: '" + result.value + "'",
    );
  }

  if (result.value.type !== expectedType) {
    throw new Error(
      "Unexpected error: " + result.value.type + " - " + result.value.message,
    );
  }
}

test("empty source compiles to valid JS", () => {
  expectValid("", 0);
});

test("bare number exits with that value", () => {
  expectValid("1", 1);
});

test("arithmetic expression exits with result", () => {
  expectValid("1 + 2", 3);
});

test("chained addition exits with result", () => {
  expectValid("1 + 2 + 3", 6);
});

test("addition and subtraction exits with result", () => {
  expectValid("2 + 3 - 1", 4);
});

test("multiplication with addition respects precedence", () => {
  expectValid("2 * 3 + 4", 10);
});
