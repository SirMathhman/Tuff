import { describe, expect, test } from "vitest";

import { lintCode } from "./compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects obviously non-bool if condition", async () => {
    const entryCode =
      'fn main() => { let x = if ("nope") { 1 } else { 2 }; x }\n';
    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    const errors = r.errors ?? [];
    expect(errors.some((e) => /bool|condition/i.test(e.msg))).toBe(true);
  });
});
