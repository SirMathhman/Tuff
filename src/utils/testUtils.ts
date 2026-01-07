import { assert, expect } from "vitest";
import { Result, isOk } from "../result";

function assertValue<T>(
  value: T,
  expected: T,
  matcher: "toBe" | "toEqual"
): void {
  if (matcher === "toBe") {
    expect(value).toBe(expected);
  } else {
    expect(value).toEqual(expected);
  }
}

export function expectOkValue<T, E>(result: Result<T, E>, expected: T): void {
  if (isOk(result)) {
    assertValue(result.value, expected, "toBe");
  } else {
    assert.fail(String(result.error));
  }
}

export function expectOkEqual<T, E>(result: Result<T, E>, expected: T): void {
  if (isOk(result)) {
    assertValue(result.value, expected, "toEqual");
  } else {
    assert.fail(String(result.error));
  }
}
