import { describe, expect, test } from "vitest";

import { lintCode } from "./compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects let annotation mismatch for method-field call", async () => {
    const entryCode = [
      "class fn Counter(start: I32) => {",
      "  let mut count = start;",
      "  fn get() : I32 => count;",
      "}",
      "",
      "fn main() : Bool => {",
      "  let c = Counter(0);",
      "  let y: Bool = c.get();", // should be I32
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

  test("accepts method-field call when types match", async () => {
    const entryCode = [
      "class fn Counter(start: I32) => {",
      "  let mut count = start;",
      "  fn get() : I32 => count;",
      "}",
      "",
      "fn main() : I32 => {",
      "  let c = Counter(0);",
      "  let y: I32 = c.get();",
      "  y",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    expect((r.errors ?? []).length).toBe(0);
  });
});
