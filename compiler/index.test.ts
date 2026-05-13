import { describe, expect, test } from "bun:test";

import { interpretTuff } from "./index";

describe("interpretTuff", () => {
  test("empty string returns 0", () => {
    expect(interpretTuff("")).toBe(0);
  });

  test('"100U8" returns 100', () => {
    expect(interpretTuff("100U8")).toBe(100);
  });

  test('"-100U8" throws Error', () => {
    expect(() => interpretTuff("-100U8")).toThrow(Error);
  });

  test('"256U8" throws Error', () => {
    expect(() => interpretTuff("256U8")).toThrow(Error);
  });

  test('"-100U16" throws Error', () => {
    expect(() => interpretTuff("-100U16")).toThrow(Error);
  });

  test('"-100I8" returns -100', () => {
    expect(interpretTuff("-100I8")).toBe(-100);
  });

  test('"1U8 + 255U8" throws Error', () => {
    expect(() => interpretTuff("1U8 + 255U8")).toThrow(Error);
  });

  test('"1U8 + 255U16" returns 256', () => {
    expect(interpretTuff("1U8 + 255U16")).toBe(256);
  });

  test('"2U8 + 3U8 - 4U8" returns 1', () => {
    expect(interpretTuff("2U8 + 3U8 - 4U8")).toBe(1);
  });
});
