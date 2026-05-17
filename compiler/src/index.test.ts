import { test, expect } from "bun:test";
import { compile } from ".";
import { Err, Ok } from "./result";

function assertValid(source: string, stdIn: string, expectedExitCode: number) {
  test(source, () => {
    const compiled = compile(source);
    if (compiled instanceof Ok) {
      expect(new Function("stdIn", compiled.value)(stdIn)).toBe(expectedExitCode);
    } else {
      expect(compiled).toBeInstanceOf(Ok);
    }
  });
}

assertValid("", "", 0);
assertValid("read<U8>()", "100", 100);
assertValid("read<U16>()", "100", 100);
assertValid("read<U8>() + read<U8>()", "100 20", 120);
assertValid("let x : U8 = read<U8>(); x", "120", 120);
assertValid("let x = read<U8>(); x", "120", 120);
assertValid("let x = 100; x", "", 100);


assertValid("let x : U8 = read<U8>(); x + x", "120", 240);
assertValid("let mut x = read<U8>(); x = read<U8>(); x", "1 2", 2);
assertValid("let x : Bool = true; x", "", 1);
assertValid("let x : Bool = false; x", "", 0);
assertValid("let x = read<Bool>(); x", "false", 0);
assertValid("let x = true; let y = false; x || y", "", 1);
assertValid("let x = true; let y = false; x && y", "", 0);

// Comparison operators produce booleans, converted to numbers on return
assertValid("let x = 0; let y = 1; x < y", "", 1);
assertValid("let x = 2; let y = 1; x > y", "", 1);
assertValid("let x = 1; let y = 1; x <= y", "", 1);
assertValid("let x = 1; let y = 0; x >= y", "", 1);
assertValid("let x = 5; let y = 5; x == y", "", 1);
assertValid("let x = 3; let y = 4; x != y", "", 1);

// if/else expressions
assertValid("let x : I32 = if (read<Bool>()) 3 else 5; x", "true", 3);
assertValid("let mut x = 0; { x = 1; } x", "", 1);

// if/else blocks with mutable variable reassignment inside them
assertValid(
  "let mut x = 0; if (read<Bool>()) { x = 1; } else { x = 2; } x",
  "true",
  1,
);

// Variable declared inside block is not accessible outside it

test("variable in block not visible outside", () => {
  expect(compile("{ let x = 0; } x")).toBeInstanceOf(Err);
});


