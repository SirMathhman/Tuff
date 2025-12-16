import { describe, expect, test } from "vitest";

import { lintCode } from "../compiler_api_wrapper";

describe("selfhost analyzer (primitives + operator typing)", () => {
  test("enforces U32 and Char annotations", async () => {
    // U32 should be enforced (string is not assignable)
    {
      const bad = [
        "fn main() : I32 => {",
        '  let x: U32 = "nope";',
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect((r.errors ?? []).some((e) => /U32|String|type/i.test(e.msg))).toBe(
        true
      );
    }

    // Char should be enforced (string is not assignable)
    {
      const bad = [
        "fn main() : I32 => {",
        '  let c: Char = "A";',
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) => /Char|String|type/i.test(e.msg))
      ).toBe(true);
    }
  });

  test("enforces more integer widths and floats", async () => {
    // --- more integer widths: should be enforced ---
    for (const ty of ["U8", "U16", "U64", "I8", "I16", "I64"]) {
      const bad = [
        "fn main() : I32 => {",
        `  let x: ${ty} = "nope";`,
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) =>
          new RegExp(`${ty}|String|type`, "i").test(e.msg)
        )
      ).toBe(true);
    }

    // --- floats: annotation mismatch should be enforced ---
    {
      const bad = [
        "fn main() : I32 => {",
        '  let x: F32 = "nope";',
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect((r.errors ?? []).some((e) => /F32|String|type/i.test(e.msg))).toBe(
        true
      );
    }

    // This specifically requires float literal parsing: today, `2.0` must be
    // a float literal, not a tuple index.
    {
      const bad = [
        "fn main() : I32 => {",
        '  let x: F32 = "nope" * 2.0;',
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) =>
          /F32|\*|mul|operand|String|type/i.test(e.msg)
        )
      ).toBe(true);
    }

    // --- float comparisons: should accept float operands but reject string/float mix ---
    {
      const good = [
        "fn main() : I32 => {",
        "  let a: F32 = 3.14;",
        "  let b: F32 = 2.71;",
        "  if (a > b) { 1 } else { 0 }",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(good, {});
      expect(r.diagnostics ?? "").toBe("");
      expect(r.success).toBe(true);
    }

    {
      const bad = [
        "fn main() : I32 => {",
        '  let x: Bool = "nope" > 2.0;',
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect(
        (r.errors ?? []).some((e) =>
          /operand|comparison|String|type/i.test(e.msg)
        )
      ).toBe(true);
    }

    // --- typed float suffixes: F32 and F64 ---
    {
      const good = [
        "fn main() : I32 => {",
        "  let a: F32 = 3.14F32;",
        "  let b: F64 = 2.71F64;",
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(good, {});
      expect(r.diagnostics ?? "").toBe("");
      expect(r.success).toBe(true);
    }

    // Typed float suffix type mismatch should be rejected
    {
      const bad = [
        "fn main() : I32 => {",
        "  let x: F64 = 3.14F32;",
        "  0",
        "}",
        "",
      ].join("\n");
      const r = await lintCode(bad, {});
      expect(r.success).toBe(false);
      expect((r.errors ?? []).some((e) => /F32|F64|type/i.test(e.msg))).toBe(
        true
      );
    }
  });

  test("rejects obviously invalid arithmetic operand types", async () => {
    const bad = [
      "fn main() : I32 => {",
      '  let x: I32 = "nope" * 2;',
      "  x",
      "}",
      "",
    ].join("\n");

    const r = await lintCode(bad, {});
    expect(r.success).toBe(false);
    expect(
      (r.errors ?? []).some((e) =>
        /\*|mul|operand|I32|String|type/i.test(e.msg)
      )
    ).toBe(true);
  });
});
