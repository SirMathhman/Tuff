import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, map, andThen, unwrapOr } from "../src/result";

describe("Result helpers", () => {
  it("ok/err and type guards", () => {
    const a = ok(1);
    expect(isOk(a)).toBe(true);
    expect(isErr(a)).toBe(false);

    const b = err("nope");
    expect(isOk(b)).toBe(false);
    expect(isErr(b)).toBe(true);
  });

  it("map works on Ok and passes through Err", () => {
    const a = ok(2);
    const a2 = map(a, (x) => x + 3);
    expect(isOk(a2)).toBe(true);
    if (isOk(a2)) expect(a2.value).toBe(5);

    const b = err<string>("err");
    const b2 = map(b, (x: number) => x + 1);
    expect(isErr(b2)).toBe(true);
  });

  it("andThen chains successful results and short-circuits on Err", () => {
    const a = ok(2);
    const a2 = andThen(a, (x) => ok(x * 5));
    expect(isOk(a2)).toBe(true);
    if (isOk(a2)) expect(a2.value).toBe(10);

    const b = err<number>("fail");
    const b2 = andThen(b, (x) => ok(x * 2));
    expect(isErr(b2)).toBe(true);
  });

  it("unwrapOr returns fallback on Err", () => {
    const b = err<number>("fail");
    expect(unwrapOr(b, 42)).toBe(42);
    const a = ok(7);
    expect(unwrapOr(a, 42)).toBe(7);
  });
});
