import { test, expect } from "bun:test";
import {
  checkIntegerRange,
  integerTypeFromSuffix,
  isAssignable,
  type Type,
} from "../src/types";

const U8: Type = { kind: "U8" };
const U16: Type = { kind: "U16" };
const U32: Type = { kind: "U32" };
const Num: Type = { kind: "Number" };
const Str: Type = { kind: "Str" };

test("integerTypeFromSuffix returns info for known suffixes", () => {
  expect(integerTypeFromSuffix("U8")?.bits).toBe(8);
  expect(integerTypeFromSuffix("U16")?.bits).toBe(16);
  expect(integerTypeFromSuffix("U32")?.bits).toBe(32);
});

test("integerTypeFromSuffix returns undefined for unknown suffixes", () => {
  expect(integerTypeFromSuffix("U64")).toBeUndefined();
  expect(integerTypeFromSuffix("")).toBeUndefined();
});

test("isAssignable allows identical types", () => {
  expect(isAssignable(U8, U8)).toBe(true);
  expect(isAssignable(U16, U16)).toBe(true);
  expect(isAssignable(Num, Num)).toBe(true);
});

test("isAssignable allows widening between unsigned integers", () => {
  expect(isAssignable(U16, U8)).toBe(true);
  expect(isAssignable(U32, U8)).toBe(true);
  expect(isAssignable(U32, U16)).toBe(true);
});

test("isAssignable rejects narrowing between unsigned integers", () => {
  expect(isAssignable(U8, U16)).toBe(false);
  expect(isAssignable(U8, U32)).toBe(false);
  expect(isAssignable(U16, U32)).toBe(false);
});

test("isAssignable rejects unrelated types", () => {
  expect(isAssignable(Str, U8)).toBe(false);
  expect(isAssignable(U8, Str)).toBe(false);
  expect(isAssignable(Num, U8)).toBe(false);
});

test("checkIntegerRange accepts in-range values", () => {
  expect(() => checkIntegerRange("U8", 0)).not.toThrow();
  expect(() => checkIntegerRange("U8", 255)).not.toThrow();
  expect(() => checkIntegerRange("U32", 4294967295)).not.toThrow();
});

test("checkIntegerRange rejects out-of-range values", () => {
  expect(() => checkIntegerRange("U8", 256)).toThrow();
  expect(() => checkIntegerRange("U8", -1)).toThrow();
  expect(() => checkIntegerRange("U16", 65536)).toThrow();
});

test("checkIntegerRange rejects unknown suffixes", () => {
  expect(() => checkIntegerRange("U64", 1)).toThrow();
});
