import { describe, expect, test } from "vitest";

import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  const rc2 = (tuffc1 as any).main([stage2In, stage2Out]);
  expect(rc2).toBe(0);

  const tuffc2 = await import(pathToFileURL(stage2Out).toString());
  expect(typeof (tuffc2 as any).main).toBe("function");

  return { stage2Dir, tuffc2: tuffc2 as any };
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

describe("selfhost lint-only mode", () => {
  test("--lint-only lints without writing output", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-only",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const inFile = resolve(stage2Dir, "src", "main.tuff");
    const outFile = resolve(stage2Dir, "out.mjs");

    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  x", "}", ""].join("\n")
    );

    const rc = tuffc2.main(["--lint-only", inFile]);
    expect(rc).toBe(0);
    expect(await exists(outFile)).toBe(false);
  });

  test("--lint-only reports errors (and still writes no output)", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-only",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const inFile = resolve(stage2Dir, "bad.tuff");
    const outFile = resolve(stage2Dir, "out.mjs");

    // Missing else in if-as-expression is a parse-time error in this compiler.
    await writeText(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = if (true) 1;",
        "  x",
        "}",
        "",
      ].join("\n")
    );

    expect(() => tuffc2.main(["--lint-only", inFile])).toThrow();
    expect(await exists(outFile)).toBe(false);
  });

  test("--lint-only walks imports and fails on dependency errors", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-only",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const entry = resolve(stage2Dir, "src", "main.tuff");
    const dep = resolve(stage2Dir, "src", "util", "math.tuff");
    const outFile = resolve(stage2Dir, "out.mjs");

    await writeText(
      dep,
      [
        // Shadowing is forbidden; this should be caught by the analyzer.
        "out fn bad(x: I32) : I32 => {",
        "  let x: I32 = 1;",
        "  x",
        "}",
        "",
      ].join("\n")
    );

    await writeText(
      entry,
      [
        "from src::util::math use { bad };",
        "fn main() : I32 => bad(0);",
        "",
      ].join("\n")
    );

    expect(() => tuffc2.main(["--lint-only", entry])).toThrow(/shadow/i);
    expect(await exists(outFile)).toBe(false);
  });
});
