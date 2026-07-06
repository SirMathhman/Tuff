import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

function throwWithoutUsingThrows(message) {
  // Using expect to avoid using 'throws'
  expect(message).toBe("Nothing to report.");
}

function assertValid(source, stdIn, expectedExitCode) {
  const generated = compileTuffToJS(source);
  if (!generated.isOk) {
    // Using expect to avoid using 'throws'
    throwWithoutUsingThrows("Error reported: " + generated.error);
    return;
  }

  const value = generated.value;

  try {
    const actualExitCode = new Function("stdIn", value)(stdIn);
    expect(actualExitCode).toBe(expectedExitCode);
  } catch (e) {
    throwWithoutUsingThrows(
      "Failed to execute generated code: '" + value + "', Error: " + e.message,
    );
  }
}

function assertInvalid(source) {
  const generated = compileTuffToJS(source);
  if (generated.isOk) {
    throwWithoutUsingThrows(
      "Expected compilation to fail, but compiler produced: '" +
        generated.value +
        "'",
    );
  }
}

test("empty source compiles and exits with code 0", () => {
  assertValid("", "", 0);
});

test("whitespace-only source compiles and exits with code 0", () => {
  assertValid(" ", "", 0);
});
