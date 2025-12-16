import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects calling __tuff_struct_lit directly", async () => {
    const entryCode = "fn main() => { __tuff_struct_lit(Foo, 1) }\n";
    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => /unknown name/i.test(e.msg))).toBe(
      true
    );
  });
});
