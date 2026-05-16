import { test, expect } from "bun:test";
import { compile, STD_IN, READ_TYPES, READ_PREFIX } from ".";

function assertValid(source: string, stdIn: string, expectedExitCode: number) {
  test(source, () => {
    const compiled = compile(source);
    expect(new Function(STD_IN, compiled)(stdIn)).toBe(expectedExitCode);
  });
}

assertValid("", "", 0);

for (const type of READ_TYPES) {
  assertValid(READ_PREFIX + type + ">()", "100", 100);
}

assertValid("read<U8>() + read<U8>()", "1 2", 3);
