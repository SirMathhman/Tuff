// Our first compile test, the VM should shut down instantly

import { describe, it, expect } from "bun:test";
import { compile, executeWithArray, executeWithArrayToDump } from "../src/app";

// Test helpers
function buildDumpMessage(
  expected: number,
  exitCode: number,
  dump: ReturnType<typeof executeWithArrayToDump>[1],
): string {
  const joinedCycles = dump.cycles
    .map(
      (cycle, index) =>
        index +
        ": " +
        cycle.beforeInstructionExecuted.prettyPrint() +
        " -> " +
        JSON.stringify(cycle.instructionToExecute),
    )
    .join("\n");

  return `Expected exit code ${expected} but got ${exitCode}\nMemory Dump:\n${joinedCycles}`;
}

function assertValid(source: string, expected: number, ...stdIn: number[]) {
  const compileResult = compile(source);
  if (compileResult.ok) {
    const execResult = executeWithArray(compileResult.value, stdIn);
    if (execResult !== expected) {
      expect(
        "Failed to execute compiled instructions: " +
          JSON.stringify(compileResult.value, null, 2),
      ).toBeUndefined();
    }

    if (execResult !== expected) {
      const [exitCode, dump] = executeWithArrayToDump(
        compileResult.value,
        stdIn,
      );
      expect(buildDumpMessage(expected, exitCode, dump)).toBeUndefined();
    }
  } else {
    expect(compileResult.error).toBeUndefined();
  }
}

// function assertInvalid(source: string) {
//   const compileResult = compile(source);
//   if (compileResult.ok) {
//     expect(
//       "Expected compilation to fail, but it succeeded with: " +
//         JSON.stringify(compileResult.value, null, 2),
//     ).toBeUndefined();
//   }
// }

describe("The application - Basic tests", () => {
  it("should execute a simple program that halts immediately", () => {
    assertValid("", 0);
  });

  it("should output 100", () => {
    assertValid("100", 100);
  });
});
