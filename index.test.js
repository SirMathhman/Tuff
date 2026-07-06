import { test, expect } from "bun";
import { compileTuffToJS } from ".";
import { act } from "react";

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
    const actualExitCode = new Function("stdIn", source)(stdIn);
    expect(actualExitCode).toBe(expectedExitCode);
  } catch (e) {
    throwWithoutUsingThrows(
      "Failed to execute generated code: '" + generated.error + "'",
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
