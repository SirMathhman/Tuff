import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects arg type mismatch for function-typed value call", async () => {
    const entryCode = [
      "class fn Adder(x: I32) => {",
      "  fn add(y: I32) : I32 => x + y;",
      "}",
      "",
      "fn main() : I32 => {",
      "  let a = Adder(1);",
      "  let f = a.add;",
      "  let z: I32 = f(true);", // y must be I32
      "  z",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    const errors = r.errors ?? [];
    expect(
      errors.some((e) =>
        /arg|expected|I32|Bool|mismatch|annotation/i.test(e.msg)
      )
    ).toBe(true);
  });

  test("infers generic type args for method-field call without explicit <...>", async () => {
    const entryCode = [
      "class fn Box() => {",
      "  fn id<T>(x: T) : T => x;",
      "}",
      "",
      "fn main() : I32 => {",
      "  let b = Box();",
      "  let y: I32 = b.id(123);",
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
