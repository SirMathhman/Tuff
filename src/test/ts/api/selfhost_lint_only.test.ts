import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  compileCode,
  lintCode,
  setFluffOptions,
} from "../compiler_api_wrapper";

describe("selfhost fluff", () => {
  beforeEach(async () => {
    // Treat unused locals as errors for this suite.
    await setFluffOptions(2, 0);
  });

  afterEach(async () => {
    // Reset to defaults to avoid cross-test contamination.
    await setFluffOptions(0, 0);
  });

  test("error-level lints fail and still report multiple diagnostics", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let a: I32 = 1;",
      "  let b: I32 = 2;",
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);
    const errText = (r.errors ?? []).map((e) => e.msg).join("\n");
    expect(errText).toMatch(/unused\s+local/i);
    expect(errText).toMatch(/\ba\b/);
    expect(errText).toMatch(/\bb\b/);
  });

  test("tuffc compilation fails on error-level lints and writes no output", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let x: I32 = 1;",
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, {});
    expect(r.success).toBe(false);
    expect(String(r.diagnostics ?? "")).toMatch(/unused\s+local/i);
  });
});
