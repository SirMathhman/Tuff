import { expect } from "vitest";
import { Result, isOk } from "../src/result";

function assertOkResult<T, E>(result: Result<T, E>): void {
  expect(isOk(result)).toBe(true);
}

function assertValue<T>(value: T, expected: T, matcher: "toBe" | "toEqual"): void {
  if (matcher === "toBe") {
    expect(value).toBe(expected);
  } else {
    expect(value).toEqual(expected);
  }
}

export function expectOkValue<T, E>(result: Result<T, E>, expected: T): void {
  assertOkResult(result);
  if (isOk(result)) {
    assertValue(result.value, expected, "toBe");
  }
}

export function expectOkEqual<T, E>(result: Result<T, E>, expected: T): void {
  assertOkResult(result);
  if (isOk(result)) {
    assertValue(result.value, expected, "toEqual");
  }
}
