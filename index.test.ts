import { expect, test } from "bun:test";
import { interpretTuff, ok } from "./index.ts";

test("interpretTuff('1') returns Ok(1)", () => {
  expect(interpretTuff("1")).toEqual(ok(1));
});

test("interpretTuff('1 + 2') returns Ok(3)", () => {
  expect(interpretTuff("1 + 2")).toEqual(ok(3));
});

test("interpretTuff('2 + 3 - 4') returns Ok(1)", () => {
  expect(interpretTuff("2 + 3 - 4")).toEqual(ok(1));
});

test("interpretTuff('2 * 3 + 4') returns Ok(10)", () => {
  expect(interpretTuff("2 * 3 + 4")).toEqual(ok(10));
});

test("interpretTuff('-5') returns Ok(-5)", () => {
  expect(interpretTuff("-5")).toEqual(ok(-5));
});

test("interpretTuff('1 - -2') returns Ok(3)", () => {
  expect(interpretTuff("1 - -2")).toEqual(ok(3));
});

test("interpretTuff('1+') is an InvalidTerm error", () => {
  const result = interpretTuff("1+");
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.kind).toBe("InvalidTerm");
});

test("interpretTuff('9007199254740993') is a TermTooLarge error", () => {
  const result = interpretTuff("9007199254740993");
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.kind).toBe("TermTooLarge");
});

test("every error has why, where, and fix", () => {
  ["1+", "9007199254740993", "abc"].forEach((source) => {
    const result = interpretTuff(source);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.why).not.toBe("");
      expect(result.error.where.index).toBeGreaterThanOrEqual(0);
      expect(result.error.fix).not.toBe("");
    }
  });
});

test("interpretTuff('99999999999 * 99999999999') is a ResultTooLarge error", () => {
  const result = interpretTuff("99999999999 * 99999999999");
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.kind).toBe("ResultTooLarge");
});

test("interpretTuff('9007199254740991 + 2 - 2') is a ResultTooLarge error", () => {
  const result = interpretTuff("9007199254740991 + 2 - 2");
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.kind).toBe("ResultTooLarge");
});

test("interpretTuff('9007199254740991 - 1') returns Ok(9007199254740990)", () => {
  expect(interpretTuff("9007199254740991 - 1")).toEqual(ok(9007199254740990));
});

test("interpretTuff('2 * -3') returns Ok(-6)", () => {
  expect(interpretTuff("2 * -3")).toEqual(ok(-6));
});

test("interpretTuff('- 2 * 3') returns Ok(-6)", () => {
  expect(interpretTuff("- 2 * 3")).toEqual(ok(-6));
});

test("interpretTuff('1 * 2 * 3 - 4 * 5') returns Ok(-14)", () => {
  expect(interpretTuff("1 * 2 * 3 - 4 * 5")).toEqual(ok(-14));
});

test("interpretTuff('2\\t + 3') returns Ok(5)", () => {
  expect(interpretTuff("2\t + 3")).toEqual(ok(5));
});

test("interpretTuff('(2 + 3) * 4') returns Ok(20)", () => {
  expect(interpretTuff("(2 + 3) * 4")).toEqual(ok(20));
});

test("interpretTuff('((1 + 2) * 3)') returns Ok(9)", () => {
  expect(interpretTuff("((1 + 2) * 3)")).toEqual(ok(9));
});

test("interpretTuff('-(2 + 3)') returns Ok(-5)", () => {
  expect(interpretTuff("-(2 + 3)")).toEqual(ok(-5));
});

test("interpretTuff('()') is an error", () => {
  expect(interpretTuff("()").ok).toBe(false);
});

test("interpretTuff('(1 + 2') is an error", () => {
  expect(interpretTuff("(1 + 2").ok).toBe(false);
});

test("interpretTuff('') is an error, not 0", () => {
  expect(interpretTuff("").ok).toBe(false);
});

test("interpretTuff('   ') is an error, not 0", () => {
  expect(interpretTuff("   ").ok).toBe(false);
});

test("interpretTuff('abc') is an error, not NaN", () => {
  expect(interpretTuff("abc").ok).toBe(false);
});

test("interpretTuff('0x1F') is an error", () => {
  expect(interpretTuff("0x1F").ok).toBe(false);
});
