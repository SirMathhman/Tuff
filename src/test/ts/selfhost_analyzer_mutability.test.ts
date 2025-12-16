import { describe, expect, test } from "vitest";

import {
  compileCode,
  importEsmFromSource,
  lintCode,
} from "./compiler_api_wrapper";

describe("selfhost analyzer", () => {
  test("rejects assignment to immutable let", async () => {
    const entryCode = "fn main() => { let x = 1; x = 2; x }\n";
    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(false);
    const errors = r.errors ?? [];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /immutable|mut/i.test(e.msg))).toBe(true);
  });

  test("allows assignment to let mut", async () => {
    const entryCode = "fn main() => { let mut x = 1; x = x + 2; x }\n";
    const r = await compileCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    expect(typeof r.entryJs).toBe("string");

    const mod = await importEsmFromSource(r.entryJs as string);
    expect(mod.main()).toBe(3);
  });
});
