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

function assertInvalid(source: string) {
  const compileResult = compile(source);
  if (compileResult.ok) {
    expect(
      "Expected compilation to fail, but it succeeded with: " +
        JSON.stringify(compileResult.value, null, 2),
    ).toBeUndefined();
  }
}

describe("The application - Basic tests", () => {
  it("should execute a simple program that halts immediately", () => {
    assertValid("", 0);
  });

  it("should output 100", () => {
    assertValid("100", 100);
  });

  it("should output 100 with U8 suffix", () => {
    assertValid("100U8", 100);
  });

  it("should reject negative U8 literal", () => {
    assertInvalid("-100U8");
  });

  it("should reject U8 literal exceeding max value", () => {
    assertInvalid("256U8");
  });

  it("should reject negative U16 literal", () => {
    assertInvalid("-100U16");
  });
});

describe("The application - U32 and U64 tests", () => {
  it("should output 100 with U32 suffix", () => {
    assertValid("100U32", 100);
  });

  it("should reject negative U32 literal", () => {
    assertInvalid("-100U32");
  });

  it("should output 100 with U64 suffix", () => {
    assertValid("100U64", 100);
  });

  it("should reject negative U64 literal", () => {
    assertInvalid("-100U64");
  });
});

describe("The application - I8 tests", () => {
  it("should output 100 with I8 suffix", () => {
    assertValid("100I8", 100);
  });

  it("should reject I8 literal exceeding max value", () => {
    assertInvalid("128I8");
  });

  it("should reject I8 literal below min value", () => {
    assertInvalid("-129I8");
  });

  it("should output -1 with I8 suffix", () => {
    assertValid("-1I8", -1);
  });
});

describe("The application - I16 tests", () => {
  it("should output 100 with I16 suffix", () => {
    assertValid("100I16", 100);
  });

  it("should reject I16 literal exceeding max value", () => {
    assertInvalid("32768I16");
  });

  it("should reject I16 literal below min value", () => {
    assertInvalid("-32769I16");
  });
});

describe("The application - I32 tests", () => {
  it("should output 100 with I32 suffix", () => {
    assertValid("100I32", 100);
  });

  it("should reject I32 literal exceeding max value", () => {
    assertInvalid("2147483648I32");
  });

  it("should reject I32 literal below min value", () => {
    assertInvalid("-2147483649I32");
  });
});

describe("The application - I64 tests", () => {
  it("should output 100 with I64 suffix", () => {
    assertValid("100I64", 100);
  });
});

describe("The application - Read tests", () => {
  it("should read U8 from input", () => {
    assertValid("read U8", 100, 100);
  });

  it("should read U8 and add 1", () => {
    assertValid("read U8 + 1U8", 101, 100);
  });

  it("should add 1 and read U8", () => {
    assertValid("1U8 + read U8", 101, 100);
  });

  it("should read U8 twice and add them", () => {
    assertValid("read U8 + read U8", 3, 1, 2);
  });

  it("should read U8 three times and add them", () => {
    assertValid("read U8 + read U8 + read U8", 6, 1, 2, 3);
  });

  it("should read and perform mixed arithmetic", () => {
    // Expression: read U8 + read U8 - read U8
    // Parses as: (read U8 + read U8) - read U8
    // Left-to-right evaluation: A=2, B=3, C=4
    // Evaluates as: (A + B) - C = (2 + 3) - 4 = 5 - 4 = 1
    assertValid("read U8 + read U8 - read U8", 1, 2, 3, 4);
  });

  it("should multiply and subtract", () => {
    // Expression: read U8 * read U8 - read U8
    // Parses as: (read U8 * read U8) - read U8
    // Left-to-right evaluation: A=2, B=3, C=4
    // Evaluates as: (A * B) - C = (2 * 3) - 4 = 6 - 4 = 2
    assertValid("read U8 * read U8 - read U8", 2, 2, 3, 4);
  });

  it("should respect operator precedence with multiplication", () => {
    // Expression: read U8 + read U8 * read U8
    // Parses as: read U8 + (read U8 * read U8)
    // Left-to-right evaluation: A=5, B=3, C=4
    // Evaluates as: A + (B * C) = 5 + (3 * 4) = 5 + 12 = 17
    assertValid("read U8 + read U8 * read U8", 17, 5, 3, 4);
  });

  it("should respect parentheses and operator precedence", () => {
    // Expression: (read U8 + read U8) * read U8
    // Parses as: (read U8 + read U8) * read U8
    // Left-to-right evaluation: A=2, B=3, C=4
    // Evaluates as: (A + B) * C = (2 + 3) * 4 = 5 * 4 = 20
    assertValid("(read U8 + read U8) * read U8", 20, 2, 3, 4);
  });
});
