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
assertValid("let x : U8 = read<U8>();", "120", 0);
test("duplicate variable declaration returns Err", () => {
  const result = compile("let x = read<U8>(); let x = read<U8>();");
  expect(result).toBeInstanceOf(Err);
});


