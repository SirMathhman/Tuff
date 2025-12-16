import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { lintCode, setFluffOptions } from "../compiler_api_wrapper";

describe("selfhost analyzer linting", () => {
  beforeEach(async () => {
    // Enable unused locals as warnings for these tests.
    await setFluffOptions(1, 0);
  });

  afterEach(async () => {
    // Reset to defaults to avoid cross-test contamination.
    await setFluffOptions(0, 0);
  });

  test("warns on unused local variables", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let x: I32 = 1;", // should warn
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/unused\s+local/i);
    expect(warnText).toMatch(/\bx\b/);
  });

  test("warns when a local is only written (never read)", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let mut x: I32 = 0;",
      "  x = 1;", // write only
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/unused\s+local/i);
    expect(warnText).toMatch(/\bx\b/);
  });

  test("does not warn when a local is read", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let mut x: I32 = 0;",
      "  x = 1;",
      "  x",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/unused\s+local/i);
  });

  test("does not warn for underscore-prefixed locals", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let _ignored: I32 = 2;", // should NOT warn
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/unused\s+local/i);
  });
});
