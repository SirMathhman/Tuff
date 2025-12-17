import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { lintCode, setFluffFileSizeOptions } from "../compiler_api_wrapper";

import { combinedDiagText } from "./test_utils";

function mkFileWithLines(totalLines: number): string {
  // Keep it parseable: a single function with many comment lines.
  // Ensure final expression is present (no trailing semicolon) for block value.
  const lines: string[] = [];
  lines.push("out fn run() : I32 => {");
  for (let i = 0; i < totalLines - 3; i++) {
    lines.push(`  // line ${i + 2}`);
  }
  lines.push("  0");
  lines.push("}");
  return lines.join("\n") + "\n";
}

describe("selfhost file size linting (in-memory)", () => {
  beforeEach(async () => {
    // Default for this suite: enable as error with 500 line threshold.
    await setFluffFileSizeOptions(2, 500);
  });

  afterEach(async () => {
    // Reset to off.
    await setFluffFileSizeOptions(0, 0);
  });

  test("errors when file exceeds threshold", async () => {
    const entryCode = mkFileWithLines(501);
    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);

    const combined = combinedDiagText(r);

    expect(combined).toMatch(/file has \d+ lines, exceeds limit of 500/i);
  });

  test("does not error when file is within threshold", async () => {
    const entryCode = mkFileWithLines(500);
    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
  });

  test("can configure a custom threshold", async () => {
    await setFluffFileSizeOptions(2, 10);
    const entryCode = mkFileWithLines(11);
    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);

    const combined = combinedDiagText(r);

    expect(combined).toMatch(/exceeds limit of 10/i);
  });
});
