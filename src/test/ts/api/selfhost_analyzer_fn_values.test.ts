import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects let annotation mismatch for function-value call", async () => {
    const entryCode = [
      "out fn run() : Bool => {",
      "  let f = (x: I32) : I32 => x + 1;",
      "  let y: Bool = f(1);", // should be I32
      "  y",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    const errors = r.errors ?? [];
    expect(
      errors.some((e) => /annotation|mismatch|Bool|I32/i.test(e.msg))
    ).toBe(true);
  });
});
