import { describe, expect, test } from "vitest";

import { lintCode } from "./compiler_api_wrapper";

describe("selfhost analyzer (phase4a+4b)", () => {
  test("enforces let annotations, struct fields, function calls, and returns", async () => {
    // --- let annotation mismatch ---
    {
      const bad = [
        "fn main() : I32 => {",
        "  let x: Bool = 1;",
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.diagnostics ?? "").toBe("");
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) => /type|Bool|I32|Int/i.test(e.msg))
      ).toBe(true);
    }

    // --- struct literal + field typing ---
    {
      const bad = [
        "struct Point { x: I32, y: I32 }",
        "fn main() : I32 => {",
        "  let p: Point = Point { true, 2 };",
        "  p.x",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.diagnostics ?? "").toBe("");
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) => /Point|field|I32|Bool|type/i.test(e.msg))
      ).toBe(true);
    }

    // --- function call arity/type + return type ---
    {
      const bad = [
        "fn add(a: I32, b: I32) : I32 => a + b",
        "fn bad_ret() : Bool => 1",
        "fn main() : I32 => {",
        "  let x: I32 = add(true, 2);",
        "  if (bad_ret()) { x } else { 0 }",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.diagnostics ?? "").toBe("");
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) =>
          /add\(|arity|argument|return|Bool|I32|type/i.test(e.msg)
        )
      ).toBe(true);
    }
  });
});
