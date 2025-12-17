import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

import { combinedDiagText } from "./test_utils";

describe("Any type (in-memory)", () => {
  test("rejects Any in type annotations", async () => {
    const entryCode = [
      "out fn run() : I32 => {",
      "  let x: Any = 1;",
      "  x",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);

    // Some invalid-type failures are surfaced as a thrown diagnostic string
    // (i.e. `lint_code` panics) rather than a structured DiagInfo[] list.
    const combined = combinedDiagText(r);

    expect(combined).toMatch(/\bAny\b/);
    expect(combined).toMatch(/invalid type|not allowed|unsupported/i);
  });
});
