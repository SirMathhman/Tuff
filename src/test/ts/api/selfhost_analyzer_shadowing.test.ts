import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects variable shadowing (nested scope redeclare)", async () => {
    const entryCode =
      "fn main() => { let x = 1; let y = { let x = 2; x }; x + y }\n";
    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    const errors = r.errors ?? [];
    expect(errors.some((e) => /shadow/i.test(e.msg))).toBe(true);
  });
});
