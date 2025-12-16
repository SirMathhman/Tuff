import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("Any type (in-memory)", () => {
  test("rejects Any in type annotations", async () => {
    const entryCode = [
      "fn main() : I32 => {",
      "  let x: Any = 1;",
      "  x",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);

    // Some invalid-type failures are surfaced as a thrown diagnostic string
    // (i.e. `lint_code` panics) rather than a structured DiagInfo[] list.
    const combined = [
      r.diagnostics ?? "",
      ...(r.errors ?? []).map((e) => `${e.msg}\n${e.help ?? ""}`),
    ].join("\n");

    expect(combined).toMatch(/\bAny\b/);
    expect(combined).toMatch(/invalid type|not allowed|unsupported/i);
  });
});
