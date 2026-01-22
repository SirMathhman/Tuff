// Our first compile test, the VM should shut down instantly

import { describe, it, expect } from "bun:test";
import { compile, executeWithArray, executeWithArrayToDump } from "../src/app";

// Test helpers
function assertValid(source: string, expected: number, ...stdIn: number[]) {
  const compileResult = compile(source);
  if (compileResult.ok) {
    const execResult = executeWithArray(compileResult.value, stdIn);
    if (execResult !== expected) {
      // Do we have an equivalent to Assertions.fail()?
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

      expect(
        "Expected exit code " +
          expected +
          " but got " +
          exitCode +
          "\nMemory Dump:\n" +
          joinedCycles,
      ).toBeUndefined();
    }
  } else {
    // Do we have an equivalent to Assertions.fail()?
    expect(compileResult.error).toBeUndefined();
  }
}

function assertInvalid(source: string) {
  const compileResult = compile(source);
  if (compileResult.ok) {
    // Do we have an equivalent to Assertions.fail()?
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

  it("should halt with exit code 100", () => {
    assertValid("100", 100);
  });

  it("should halt with exit code 100 from U8 literal", () => {
    assertValid("100U8", 100);
  });

  it("should read a U8 value from stdin and halt with it", () => {
    assertValid("read U8", 100, 100);
  });

  it("should read two U8 values, add them, and halt with result", () => {
    assertValid("read U8 + read U8", 150, 100, 50);
  });

  it("should read a U8 value and add a constant, and halt with result", () => {
    assertValid("read U8 + 50U8", 150, 100);
  });

  it("should add a constant and read a U8 value, and halt with result", () => {
    assertValid("50U8 + read U8", 150, 100);
  });

  it("should read three U8 values, add them, and halt with result", () => {
    assertValid("read U8 + read U8 + read U8", 6, 1, 2, 3);
  });
});

describe("The application - Complex expressions", () => {
  it("should read three U8 values, add first two, subtract third, and halt with result", () => {
    assertValid("read U8 + read U8 - read U8", 1, 2, 3, 4);
  });

  it("should read three U8 values, add first, multiply second and third, and halt with result", () => {
    assertValid("read U8 + read U8 * read U8", 10, 4, 2, 3);
  });

  it("should read three U8 values, add first, divide second by third, and halt with result", () => {
    assertValid("read U8 + read U8 / read U8", 7, 4, 6, 2);
  });

  it("should add two U8 values in parentheses, then divide by third, and halt with result", () => {
    assertValid("(read U8 + read U8) / read U8", 2, 10, 2, 6);
  });
});

describe("The application - Type validation", () => {
  it("should reject negative values with type suffix", () => {
    assertInvalid("-100U8");
  });

  it("should accept negative values with signed type suffix", () => {
    assertValid("-100I8", -100);
  });

  it("should reject values that overflow unsigned 8-bit", () => {
    assertInvalid("256U8");
  });
});

describe("The application - Grouping and variables", () => {
  it("should support curly braces as grouping mechanism", () => {
    assertValid("(read U8 + { read U8 }) / read U8", 2, 10, 2, 6);
  });

  it("should support simple let binding", () => {
    assertValid("let x : U8 = 5U8; x", 5);
  });

  it("should support let binding with read expression", () => {
    assertValid("let x : U8 = read U8; x", 42, 42);
  });

  it("should support let binding variable in expressions", () => {
    assertValid("let x : U8 = read U8; x + x", 84, 42);
  });
});

describe("The application - Variable bindings", () => {
  it("should support multiple let bindings", () => {
    assertValid("let x : U8 = read U8; let y : U8 = x; y", 42, 42);
  });

  it("should support let binding without trailing expression", () => {
    assertValid("let x : U8 = read U8;", 0, 42);
  });

  it("should support let binding without type annotation", () => {
    assertValid("let x = read U8; x", 42, 42);
  });

  it("should reject variable shadowing", () => {
    assertInvalid("let x = read U8; let x = read U8; x");
  });

  it("should reject type mismatch in let binding", () => {
    assertInvalid("let x : U8 = read U16; x");
  });

  it("should allow widening type in let binding", () => {
    assertValid("let x : U16 = read U8; x", 42, 42);
  });

  it("should reject type narrowing with variable", () => {
    assertInvalid("let x = read U16; let y : U8 = x; y");
  });

  it("should reject untyped variable assignment with U8", () => {
    assertInvalid("let x = 1; let y : U8 = x; y");
  });

  it("should allow untyped variable assignment with I32", () => {
    assertValid("let x = 1; let y : I32 = x; y", 1);
  });

  it("should support Bool type with read expression", () => {
    assertValid("let x : Bool = read Bool; x", 1, 1);
  });

  it("should support boolean literal false", () => {
    assertValid("let x : Bool = false; x", 0);
  });
});

describe("The application - Type checking", () => {
  it("should reject mixed-type arithmetic expressions", () => {
    assertInvalid("let x : U8 = 1U8 + 2U16; x");
  });

  it("should allow same-type widening in arithmetic", () => {
    assertValid("let x : U16 = read U16 + read U16; x", 50, 25, 25);
  });

  it("should reject mixed-type multiplication expressions", () => {
    assertInvalid("let x : U8 = 1U8 * 2U16; x");
  });

  it("should reject mixed-type arithmetic in parentheses", () => {
    assertInvalid("let x : U16 = (1U8 * 2U16); x");
  });

  it("should reject mixed-type arithmetic across operations", () => {
    assertInvalid("let x : U16 = (1U8 * 2U16) + 100U8; x");
  });

  it("should reject arithmetic operations on boolean types", () => {
    assertInvalid("let x = true; let y = false; x + y");
  });

  it("should reject bool narrowing to larger types", () => {
    assertInvalid("let x = { let y = true; y }; let z : I32 = x; z");
  });
});

describe("The application - If-else expressions", () => {
  it("should reject if-expression with non-boolean condition", () => {
    assertInvalid("let x = if ( read U8 ) 3 else 5; x");
  });

  it("should reject if-expression with incompatible branch types", () => {
    assertInvalid("let x = if ( read Bool ) 3U32 else true; x");
  });

  it("should reject if-expression result type mismatch with let binding", () => {
    assertInvalid("let x : Bool = if ( read Bool ) 3U32 else 5U32; x");
  });

  it("should reject if-expression result type mismatch in second variable", () => {
    assertInvalid(
      "let x = if ( read Bool ) 3U32 else 5U32; let y : Bool = x; y",
    );
  });
});

describe("The application - Mutable variables", () => {
  it("should support mutable variable initialization and reassignment", () => {
    assertValid("let mut x = 0; x = read I32; x", 42, 42);
  });

  it("should reject reassignment of non-mutable variables", () => {
    assertInvalid("let x = 0; x = read I32; x");
  });

  it("should reject reassignment with type change", () => {
    assertInvalid("let mut x = read Bool; x = read I32; x");
  });

  it("should allow type narrowing on reassignment", () => {
    assertValid("let mut x = read U16; x = read U8; x", 50, 300, 50);
  });
});

describe("The application - Pointers", () => {
  it("should support creating and dereferencing references", () => {
    assertValid("let x = read I32; let y : *I32 = &x; *y", 42, 42);
  });

  it("should support reference to mutable variable", () => {
    assertValid("let mut x = read I32; let y : *I32 = &x; *y", 100, 100);
  });

  it("should reject reference to non-existent variable", () => {
    assertInvalid("let y : *I32 = &x; *y");
  });

  it("should reject pointer type without initialization", () => {
    assertInvalid("let y : *I32; *y");
  });

  it("should reject dereferencing non-pointer value", () => {
    assertInvalid("let x = 5I32; *x");
  });

  it("should support mutable pointer with write-through assignment", () => {
    assertValid(
      "let mut x = read I32; let y : *mut I32 = &mut x; *y = read I32; x",
      100,
      50,
      100,
    );
  });

  it("should reject pointer type assignment to Bool", () => {
    assertInvalid("let x = 100; let y = &x; let z : Bool = y; z");
  });

  it("should reject mismatched pointer types", () => {
    assertInvalid("let x = 100; let y = &x; let z : *U8 = y; z");
  });
});

describe("The application - Pointer type safety", () => {
  it("should reject mutable reference to immutable variable", () => {
    assertInvalid(
      "let x = read I32; let y : *mut I32 = &mut x; *y = read I32; x",
    );
  });

  it("should reject immutable reference assigned to mutable pointer type", () => {
    assertInvalid(
      "let mut x = read I32; let y : *mut I32 = &x; *y = read I32; x",
    );
  });

  it("should reject mutable reference assigned to immutable pointer type", () => {
    assertInvalid(
      "let mut x = read I32; let y : *I32 = &mut x; *y = read I32; x",
    );
  });

  it("should reject write-through on immutable pointer", () => {
    assertInvalid("let mut x = read I32; let y = &x; *y = read I32; x");
  });

  it("should support multiple pointers to same variable with dereference in arithmetic", () => {
    assertValid("let x = read U8; let y = &x; let z = &x; *y + *z", 20, 10);
  });

  it("should reject mixing mutable and immutable pointers to same variable", () => {
    assertInvalid("let mut x = read U8; let y = &mut x; let z = &x; *y + *z");
  });

  it("should reject multiple mutable pointers to same variable", () => {
    assertInvalid(
      "let mut x = read U8; let y = &mut x; let z = &mut x; *y + *z",
    );
  });

  it("should reject mixing immutable and mutable references in different order", () => {
    assertInvalid("let mut x = read U8; let y = &x; let z = &mut x; *y + *z");
  });

  it("should reject mixing immutable and mutable references without trailing expression", () => {
    assertInvalid("let mut x = read U8; let y = &x; let z = &mut x;");
  });
});

describe("The application - Valid reference patterns", () => {
  it("should allow one mutable reference without trailing expression", () => {
    assertValid("let mut x = read U8; let y : *mut U8 = &mut x;", 0, 100);
  });

  it("should allow multiple immutable references with arithmetic", () => {
    assertValid("let x = read U8; let y = &x; let z = &x; *y + *z", 20, 10);
  });

  it("should allow multiple immutable references without trailing expression", () => {
    assertValid("let x = read U8; let y = &x; let z = &x;", 0, 100);
  });

  it("should allow variable declaration with type annotation but no initialization", () => {
    assertValid("let x : U8; x = read U8; x", 42, 42);
  });

  it("should reject multiple reassignments to declaration-only variable", () => {
    assertInvalid("let x : U8; x = read U8; x = 10U8; x");
  });

  it("should allow multiple reassignments to mutable declaration-only variable", () => {
    assertValid("let mut x : U8; x = read U8; x = 10U8; x", 10, 42);
  });

  it("should reject two reassignments to immutable declaration-only with constant", () => {
    assertInvalid("let x : I8; x = 5I8; x = -3I8; x");
  });

  it("should allow mutable declaration-only with multiple read and reassignments", () => {
    assertValid("let mut x : U8; x = read U8; x = read U8; x", 200, 100, 200);
  });

  it("should reject uninitialized declaration-only variable", () => {
    assertInvalid("let x : U8; x");
  });

  it("should reject uninitialized declaration-only variable used in expression", () => {
    assertInvalid("let x : U8; let y = x; y");
  });

  it("should allow declaration-only variable after assignment", () => {
    assertValid("let x : U8; x = read U8; x", 42, 42);
  });
});

describe("The application - Arrays", () => {
  it("should support array type inference from literal", () => {
    assertValid("let array = [5U8, 10U8]; array", 904);
  });

  it("should support array literal with explicit type", () => {
    assertValid(
      "let array : [U8; 2; 2] = [read U8, read U8]; array",
      904,
      5,
      10,
    );
  });

  it("should support array indexing", () => {
    assertValid(
      "let array : [U8; 2; 2] = [read U8, read U8]; array[0] + array[1]",
      15,
      5,
      10,
    );
  });

  it("should support array with read elements", () => {
    assertValid(
      "let array : [U8; 3; 3] = [read U8, read U8, read U8]; array[1]",
      20,
      10,
      20,
      30,
    );
  });

  it("should support dynamic array indexing", () => {
    assertValid(
      "let array : [U8; 2; 2] = [read U8, read U8]; let idx = 1; array[idx]",
      10,
      5,
      10,
    );
  });

  it("should support mutable array with indexed element assignment", () => {
    assertValid(
      "let mut array : [U8; 0; 2]; array[0] = read U8; array[1] = read U8; array[0] + array[1]",
      15,
      5,
      10,
    );
  });
});
