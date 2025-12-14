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

describe("selfhost lint config", () => {
  test("supports CLI flag to disable unused-locals warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-config",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const inFile = resolve(stage2Dir, "flag_disable_unused_locals.tuff");
    const outFile = resolve(stage2Dir, "flag_disable_unused_locals.mjs");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // would warn
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--no-warn-unused-locals", inFile, outFile])
    );
    expect(rc).toBe(0);
    expect(out).not.toMatch(/unused local/i);
  });

  test("supports config file to disable unused-locals warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-config",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const configFile = resolve(stage2Dir, "tuffc.conf");
    const inFile = resolve(stage2Dir, "config_disable_unused_locals.tuff");
    const outFile = resolve(stage2Dir, "config_disable_unused_locals.mjs");

    await writeFile(
      configFile,
      [
        "# simple key=value config",
        "warn_unused_locals = false",
        "warn_unused_params = true",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // would warn
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--config", configFile, inFile, outFile])
    );
    expect(rc).toBe(0);
    expect(out).not.toMatch(/unused local/i);
  });
});
