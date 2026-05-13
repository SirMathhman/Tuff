import { describe, expect, test } from "bun:test";

import { interpretTuff } from "./index";

describe("interpretTuff", () => {
  test("empty string returns 0", () => {
    expect(interpretTuff("")).toBe(0);
  });

  test('"100U8" returns 100', () => {
    expect(interpretTuff("100U8")).toBe(100);
  });
});
