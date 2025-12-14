import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function buildStage2Compiler(outDir: string) {
  const stage1Dir = resolve(outDir, "stage1");
  const stage2Dir = resolve(outDir, "stage2");
  await mkdir(stage1Dir, { recursive: true });
  await mkdir(stage2Dir, { recursive: true });

  const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
    stage1Dir,
    { includeStd: true }
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

  return { tuffc2 };
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

describe("stdlib string helper deprecations", () => {
  test("prelude deprecates stringCharCodeAt/stringFromCharCode and provides Char helpers", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-stdlib-string-deprecations",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    // Stage runtime + std sources into outDir so `std::prelude` resolves.
    await stagePrebuiltSelfhostCompiler(outDir, { includeStd: true });

    // Build a stage2 compiler from current .tuff sources so we test the latest
    // deprecation-warning implementation.
    const { tuffc2 } = await buildStage2Compiler(outDir);

    const inFile = resolve(outDir, "dep_string_helpers.tuff");
    const outFile = resolve(outDir, "dep_string_helpers.mjs");

    await writeFile(
      inFile,
      [
        "from std::prelude use { stringCharAt, stringFromChar, stringCharCodeAt, stringFromCharCode };",
        "",
        "fn main() : I32 => {",
        '  let c: Char = stringCharAt("A", 0);',
        "  let s: String = stringFromChar(c);",
        '  let x: I32 = stringCharCodeAt("B", 0);',
        "  let y: String = stringFromCharCode(x);",
        '  if (s == "A" && y == "B") { 0 } else { 1 }',
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => tuffc2.main([inFile, outFile]));
    expect(rc).toBe(0);

    // Also execute the compiled program to ensure the exports actually exist
    // and the runtime implementations behave.
    const mod = await import(
      pathToFileURL(outFile).toString() + `?v=${Date.now()}`
    );
    expect(typeof mod.main).toBe("function");
    expect(mod.main()).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/stringCharCodeAt/);
    expect(out).toMatch(/stringFromCharCode/);

    // Should hint at the preferred replacements.
    expect(out).toMatch(/stringCharAt/);
    expect(out).toMatch(/stringFromChar/);
  });
});
