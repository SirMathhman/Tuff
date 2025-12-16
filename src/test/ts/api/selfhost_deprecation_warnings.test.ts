import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

import { combinedWarnText } from "./test_utils";

describe("selfhost deprecation warnings (in-memory)", () => {
  test("warns on deprecated import and usage (// and /* */ comments)", async () => {
    const modules = {
      dep_lib: [
        "// deprecated - use add2 instead",
        "out fn add(a: I32, b: I32) : I32 => a + b",
        "",
        "out fn add2(a: I32, b: I32) : I32 => a + b",
        "",
      ].join("\n"),
    };

    const entryCode = [
      "from dep_lib use { add, add2 };",
      "",
      "fn main() : I32 => {",
      "  /* deprecated - prefer add2 */",
      "  let x: I32 = add(1, 2);",
      "  add2(x, 3)",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, modules);
    expect(r.diagnostics ?? "").toBe("");

    // Deprecations should surface as warnings, not errors.
    expect(r.success).toBe(true);

    const warnings = r.warnings ?? [];
    expect(warnings.length).toBeGreaterThan(0);
    const combined = combinedWarnText(r);
    expect(combined).toMatch(/deprecated/i);
    expect(combined).toMatch(/add/i);
    expect(combined).toMatch(/add2/i);
    expect(combined).toMatch(/use add2 instead|prefer add2/i);
  });
});
