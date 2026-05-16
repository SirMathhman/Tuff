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

assertValid("let x : U8 = read<U8>(); x + x", "120", 240);
assertValid("let mut x = read<U8>(); x = read<U8>(); x", "1 2", 2);
assertValid("let x : U8 = read<U8>();", "120", 0);
test("duplicate variable declaration returns Err", () => {
  expect((compile("let x = read<U8>(); let x = read<U8>();"))).toBeInstanceOf(Err);
});
test("type mismatch: U16 cannot fit in U8", () => {
  expect((compile("let x : U8 = read<U16>();"))).toBeInstanceOf(Err);
});

test("type mismatch via variable: U16 assigned to U8 through intermediate var", () => {
  expect((compile("let x = read<U16>(); let y : U8 = x;"))).toBeInstanceOf(Err);
});

test("reassigning immutable variable returns Err", () => {
  expect((compile("let x = read<U8>(); x = read<U8>(); x"))).toBeInstanceOf(Err);
});


