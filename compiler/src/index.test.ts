import { test, expect } from "bun:test";
import { compile, STD_IN, READ_TYPES, READ_PREFIX } from ".";

function assertValid(source: string, stdIn: string, expectedExitCode: number) {
  test(source, () => {
    const compiled = compile(source);
    expect(new Function(STD_IN, compiled)(stdIn)).toBe(expectedExitCode);
  });
}

test('""', () => {
  assertValid("", "", 0);
});

function testReadType(type: string): void {
  assertValid(READ_PREFIX + type + ">()", "100", 100);
}
for (const type of READ_TYPES) testReadType(type);
