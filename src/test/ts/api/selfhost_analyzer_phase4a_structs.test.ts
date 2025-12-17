import { describe, expect, test } from "vitest";

import {
  compileCode,
  importEsmFromSource,
  lintCode,
} from "../compiler_api_wrapper";

describe("selfhost analyzer (phase 4a)", () => {
  test("rejects let annotation mismatch", async () => {
    const entryCode = 'out fn run() => { let x: I32 = "bad"; x }\n';
    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    expect(
      (r.errors ?? []).some((e) => /let\s+x.*expected\s+I32/i.test(e.msg))
    ).toBe(true);
  });

  test("accepts let annotation match for struct", async () => {
    const entryCode = [
      "struct Point { x: I32, y: I32 }",
      "out fn run() : I32 => {",
      "  let p: Point = Point { 1, 2 };",
      "  p.x",
      "}",
      "",
    ].join("\n");

    const r = await compileCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    expect(typeof r.entryJs).toBe("string");

    const mod = await importEsmFromSource(r.entryJs as string);
    expect(mod.run()).toBe(1);
  });

  test("rejects unknown struct in struct literal", async () => {
    const entryCode = [
      "out fn run() => {",
      "  let p = Nope { 1 };",
      "  0",
      "}",
      "",
    ].join("\n");
    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => /unknown\s+struct/i.test(e.msg))).toBe(
      true
    );
  });

  test("rejects wrong arity in positional struct literal", async () => {
    const entryCode = [
      "struct Point { x: I32, y: I32 }",
      "out fn run() => {",
      "  let p = Point { 1 };",
      "  0",
      "}",
      "",
    ].join("\n");
    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);
    expect(
      (r.errors ?? []).some((e) =>
        /wrong number of values in struct literal/i.test(e.msg)
      )
    ).toBe(true);
  });

  test("rejects struct literal field type mismatch", async () => {
    const entryCode = [
      "struct Point { x: I32, y: String }",
      "out fn run() => {",
      "  let p = Point { 1, 2 };",
      "  0",
      "}",
      "",
    ].join("\n");
    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => /expected\s+String/i.test(e.msg))).toBe(
      true
    );
  });

  test("rejects unknown field access on known struct", async () => {
    const entryCode = [
      "struct Point { x: I32 }",
      "out fn run() => {",
      "  let p = Point { 1 };",
      "  p.y",
      "}",
      "",
    ].join("\n");
    const r = await lintCode(entryCode, {});
    expect(r.success).toBe(false);
    expect(
      (r.errors ?? []).some((e) =>
        /unknown\s+field\s+y\s+on\s+struct\s+Point/i.test(e.msg)
      )
    ).toBe(true);
  });
});
