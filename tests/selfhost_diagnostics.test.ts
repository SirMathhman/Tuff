import { describe, expect, test } from "bun:test";

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSelfhostCompiler } from "./helpers";

describe("selfhost diagnostics", () => {
  test("parse error includes location and caret", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-diagnostics",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await mkdir(outDir, { recursive: true });
    const { libFile } = await buildSelfhostCompiler(outDir);
    const stage1lib = (await import(pathToFileURL(libFile).toString())) as any;

    // Trigger a simple parser error: missing ')' in paren expression.
    const badSrc = `fn main() => (1 + 2`;

    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    // Should include file:line:col + a code frame caret.
    expect(msg).toMatch(/<input>:\d+:\d+/);
    expect(msg).toContain("expected");
    expect(msg).toMatch(/\n\s*\|\s*\^/);
  });
});
