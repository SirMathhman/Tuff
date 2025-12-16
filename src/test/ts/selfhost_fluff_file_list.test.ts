import { describe, expect, test } from "vitest";

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

function captureStdout<T>(fn: () => T): { value: T; out: string } {
  const oldWrite = process.stdout.write.bind(process.stdout);
  let out = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout.write as any) = (chunk: any, ...args: any[]) => {
    out += String(chunk);
    return oldWrite(chunk, ...args);
  };

  try {
    return { value: fn(), out };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout.write as any) = oldWrite;
  }
}

describe("fluff file-list CLI", () => {
  test("accepts multiple input files and lints only those files", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-fluff-file-list",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await stagePrebuiltSelfhostCompiler(outDir);

    await writeFile(
      resolve(outDir, "build.json"),
      JSON.stringify(
        {
          fluff: {
            // Ensure we get a deterministic single warning.
            unusedLocals: "warning",
            cloneDetection: "off",
          },
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const warnFile = resolve(outDir, "warn.tuff");
    const cleanFile = resolve(outDir, "clean.tuff");

    await writeFile(
      warnFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // unused local
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      cleanFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;",
        "  x",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const fluff = await import(resolve(outDir, "fluff.mjs"));

    const { value: rc, out } = captureStdout(() =>
      fluff.main(["--format", "json", warnFile, cleanFile])
    );

    // Should succeed and report exactly one warning.
    expect(rc).toBe(0);
    expect(typeof fluff.project_warning_count).toBe("function");
    expect(fluff.project_warning_count()).toBe(1);

    // Ensure the warning is attributed to warnFile and not cleanFile.
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const parsed = JSON.parse(lines[0]);
    expect(String(parsed.text)).toContain(warnFile);
    expect(String(parsed.text)).not.toContain(cleanFile);
    expect(String(parsed.text)).toMatch(/unused\s+local/i);
  });
});
