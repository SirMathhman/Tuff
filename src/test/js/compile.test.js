import { test, expect } from "bun:test";
import { compile } from "../../main/js/compile";

function expectValid(source, args, expectedExitCode) {
  const generated = compile(source);

  try {
    const actualExitCode = Function("__args__", generated)(args);
    if (actualExitCode !== expectedExitCode) {
      throw new Error(
        "Expected exit code '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: '" +
          generated +
          "'",
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'", e);
  }
}

function expectInvalid(source) {
  expect(() => compile(source)).toThrow();
}
