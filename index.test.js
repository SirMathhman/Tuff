import { test, expect } from "bun:test";
import { compile } from ".";
import { act } from "react";

function expectValid(source, stdIn, expectedExitCode) {
  const generated = compile(source);

  try {
    const actualExitCode = new Function("stdIn", generated, stdIn)();
    if (expectedExitCode != actualExitCode) {
      throw new Error(
        "Expected '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: " +
          generated,
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'");
  }
}

function expectInvalid(source) {
  expect(() => compile(source));
}


