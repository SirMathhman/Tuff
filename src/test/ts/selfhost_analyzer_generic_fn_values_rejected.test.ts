import { describe, expect, test } from "vitest";

import { lintCode } from "./compiler_api_wrapper";

describe("selfhost analyzer (generic function values)", () => {
  test("rejects assigning unspecialized generic function to a value", async () => {
    const entryCode = [
      "fn id<T>(x: T) : T => x",
      "fn main() : I32 => {",
      "  let f = id;", // should require specialization before treating as a value
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    expect(
      (r.errors ?? []).some((e) =>
        /generic|type\s*arg|specializ|type\s*param/i.test(e.msg)
      )
    ).toBe(true);
  });

  test("rejects extracting unspecialized generic method to a value", async () => {
    const entryCode = [
      "class fn Box() => {",
      "  fn id<T>(x: T) : T => x;",
      "}",
      "",
      "fn main() : I32 => {",
      "  let b = Box();",
      "  let f = b.id;", // should require specialization before treating as a value
      "  0",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    expect(
      (r.errors ?? []).some((e) =>
        /generic|type\s*arg|specializ|type\s*param/i.test(e.msg)
      )
    ).toBe(true);
  });
});
