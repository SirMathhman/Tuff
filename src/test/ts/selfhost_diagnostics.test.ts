import { describe, expect, test } from "vitest";

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost diagnostics", () => {
  test("parse error includes location and caret", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-diagnostics",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await mkdir(outDir, { recursive: true });
    const { libFile } = await stagePrebuiltSelfhostCompiler(outDir);
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
    // New format: always include file, line, col, and absolute offset.
    expect(msg).toMatch(/<input>:\d+:\d+ \(offset \d+\)/);
    expect(msg).toContain("expected");
    expect(msg).toMatch(/\n\s*\|\s*\^/);

    // For common parse errors, we include a recommended fix.
    expect(msg).toMatch(/\nhelp: /);
  });

  test("warning includes file and line", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-diagnostics",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await mkdir(outDir, { recursive: true });
    const { libFile } = await stagePrebuiltSelfhostCompiler(outDir);
    const stage1lib = (await import(pathToFileURL(libFile).toString())) as any;

    // Historically we emitted a warning for very short identifiers (like `k`).
    // That check is intentionally removed/disabled now because it was too noisy.
    const src = `fn main() => { let k = 1; k }`;

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any, ...args: any[]) => {
      chunks.push(String(chunk));
      return origWrite(chunk, ...args);
    };

    try {
      stage1lib.compile_tiny(src);
    } finally {
      (process.stdout as any).write = origWrite;
    }

    const out = chunks.join("");

    // Should NOT emit the old short-identifier warning.
    expect(out).not.toMatch(/warning: identifier 'k' is too short/);
  });
});
