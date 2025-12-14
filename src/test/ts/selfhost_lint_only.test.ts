import { describe, expect, test } from "vitest";

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildStage2SelfhostCompiler } from "./selfhost_helpers";

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

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

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

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

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

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

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
