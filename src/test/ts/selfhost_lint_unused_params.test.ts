import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { lintCode, setFluffOptions } from "./compiler_api_wrapper";

describe("selfhost analyzer linting", () => {
  beforeEach(async () => {
    // Enable unused params as warnings for these tests.
    await setFluffOptions(0, 1);
  });

  afterEach(async () => {
    // Reset to defaults to avoid cross-test contamination.
    await setFluffOptions(0, 0);
  });

  test("warns on unused function parameters", async () => {
    const entryCode = [
      "fn f(x: I32) : I32 => 0",
      "",
      "fn main() : I32 => f(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/unused\s+parameter/i);
    expect(warnText).toMatch(/\bx\b/);
  });

  test("does not warn for underscore-prefixed parameters", async () => {
    const entryCode = [
      "fn f(_x: I32) : I32 => 0",
      "",
      "fn main() : I32 => f(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/unused\s+parameter/i);
  });
});
