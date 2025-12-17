import { describe, expect, test } from "vitest";

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

function getErrorMessage(result: CaptureResult<unknown>): string {
  if (result.ok) return "";
  return result.error instanceof Error
    ? result.error.message
    : String(result.error);
}

describe("selfhost file size linting (integration)", () => {
  test("fluff reads build.json and throws on file size error", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { maxFileLines: "error", maxFileLinesThreshold: 10 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "large_file.tuff");
    const lines: string[] = [];
    lines.push("fn main() : I32 => {");
    for (let i = 0; i < 8; i++) lines.push(`  // line ${i + 2}`);
    lines.push("  0");
    lines.push("}");
    await writeFile(inFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([inFile]));
    expect(result.ok).toBe(false);
    const msg = getErrorMessage(result);
    expect(msg).toMatch(/exceeds limit of 10/i);
  });
});
