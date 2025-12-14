import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function buildStage2Compiler(outDir: string) {
  await mkdir(outDir, { recursive: true });

  const stage1Dir = resolve(outDir, "stage1");
  const stage2Dir = resolve(outDir, "stage2");
  await mkdir(stage1Dir, { recursive: true });
  await mkdir(stage2Dir, { recursive: true });

  const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
    stage1Dir
  );

  // runtime for stage2 output
  const stage2RtDir = resolve(stage2Dir, "rt");
  await mkdir(stage2RtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(stage2RtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(stage2RtDir, "vec.mjs"));

  const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
  const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

  const tuffc1 = await import(pathToFileURL(stage1File).toString());
  const rc2 = tuffc1.main([stage2In, stage2Out]);
  expect(rc2).toBe(0);

  const tuffc2 = await import(pathToFileURL(stage2Out).toString());
  expect(typeof tuffc2.main).toBe("function");

  return { stage2Dir, tuffc2 };
}

function captureStdout<T>(fn: () => T): { value: T; out: string } {
  const orig = process.stdout.write.bind(process.stdout);
  let out = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: any, ...args: any[]) => {
    out += String(chunk);
    return orig(chunk, ...args);
  };

  try {
    const value = fn();
    return { value, out };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = orig;
  }
}

describe("selfhost deprecation warnings", () => {
  test("warns on deprecated import and usage (// and /* */ comments)", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-deprecation-warnings",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const libIn = resolve(stage2Dir, "dep_lib.tuff");
    const mainIn = resolve(stage2Dir, "dep_main.tuff");
    const mainOut = resolve(stage2Dir, "dep_main.mjs");

    await writeFile(
      libIn,
      [
        "// deprecated - use add2 instead",
        "out fn add(a: I32, b: I32) : I32 => a + b",
        "",
        "out fn add2(a: I32, b: I32) : I32 => a + b",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      mainIn,
      [
        "from dep_lib use { add, add2 };",
        "",
        "fn main() : I32 => {",
        "  /* deprecated - prefer add2 */",
        "  let x: I32 = add(1, 2);",
        "  add2(x, 3)",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main([mainIn, mainOut])
    );
    expect(rc).toBe(0);

    // Should be a warning (non-fatal) and include the reason.
    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/deprecated/i);
    expect(out).toMatch(/add/);
    expect(out).toMatch(/use add2 instead/i);
  });
});
