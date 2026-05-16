import { test, expect } from "bun:test";
import { compile } from ".";

function assertValid(source: string, stdIn: string, expectedExitCode: number) {
  test(source, () => {
    const compiled = compile(source);
    expect(new Function("stdIn", compiled)(stdIn)).toBe(expectedExitCode);
  });
}

assertValid("", "", 0);
assertValid("read<U8>()", "100", 100);
assertValid("read<U16>()", "100", 100);
assertValid("read<U8>() + read<U8>()", "100 20", 120);

