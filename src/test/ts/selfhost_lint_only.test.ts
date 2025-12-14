import { describe, expect, test } from "vitest";

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildStage2SelfhostCompiler } from "./selfhost_helpers";

type CaptureResult<T> =
  | { ok: true; value: T; out: string }
  | { ok: false; error: unknown; out: string };

function captureStdout<T>(fn: () => T): CaptureResult<T> {
  const orig = process.stdout.write.bind(process.stdout);
  let out = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: any, ...args: any[]) => {
    out += String(chunk);
    return orig(chunk, ...args);
  };

  try {
    const value = fn();
    return { ok: true, value, out };
  } catch (error) {
    return { ok: false, error, out };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = orig;
  }
}

async function writeText(p: string, src: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, src, "utf8");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("selfhost fluff", () => {
  test("error-level lints fail and still report multiple diagnostics", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-fluff",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeText(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "error" } }, null, 2) + "\n"
    );

    const inFile = resolve(stage2Dir, "multi_error.tuff");
    await writeText(
      inFile,
      [
        "fn main() : I32 => {",
        "  let a: I32 = 1;",
        "  let b: I32 = 2;",
        "  0",
        "}",
        "",
      ].join("\n")
    );

    const r = captureStdout(() => fluff2.main(["--format", "json", inFile]));
    expect(r.ok).toBe(false);

    const msg =
      r.ok === false && r.error instanceof Error
        ? r.error.message
        : String((r as { error: unknown }).error);

    // In JSON mode, errors are thrown as a single JSON object with the
    // aggregated diagnostic text.
    const parsed = JSON.parse(msg);
    expect(parsed.level).toBe("error");
    expect(String(parsed.text)).toMatch(/unused local/i);
    expect(String(parsed.text)).toMatch(/\ba\b/);
    expect(String(parsed.text)).toMatch(/\bb\b/);
  });

  test("tuffc compilation fails on error-level lints and writes no output", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-fluff",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    await writeText(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "error" } }, null, 2) + "\n"
    );

    const inFile = resolve(stage2Dir, "compile_fails_on_lints.tuff");
    const outFile = resolve(stage2Dir, "compile_fails_on_lints.mjs");

    await writeText(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;",
        "  0",
        "}",
        "",
      ].join("\n")
    );

    const r = captureStdout(() => tuffc2.main([inFile, outFile]));
    expect(r.ok).toBe(false);
    expect(await exists(outFile)).toBe(false);

    const msg =
      r.ok === false && r.error instanceof Error
        ? r.error.message
        : String((r as { error: unknown }).error);
    expect(msg).toMatch(/unused local/i);
  });
});
