import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

describe("selfhost stage2", () => {
  test("selfhost tuffc can compile itself (stage2) and still compile a tiny program", async () => {
    const rootDir = resolve(
      ".dist",
      "selfhost-stage2",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const stage1Dir = resolve(rootDir, "stage1");
    const stage2Dir = resolve(rootDir, "stage2");

    await mkdir(stage1Dir, { recursive: true });
    await mkdir(stage2Dir, { recursive: true });

    // Stage 1: start from the committed prebuilt selfhost compiler
    const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
      stage1Dir
    );

    // Stage 2: use stage1 to compile the selfhost compiler source again
    await writeRuntime(stage2Dir);
    const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
    const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

    const tuffc1 = await import(pathToFileURL(stage1File).toString());
    expect(typeof tuffc1.run).toBe("function");
    const rc2 = tuffc1.run([stage2In, stage2Out]);
    expect(rc2).toBe(0);

    const stage2Js = await readFile(stage2Out, "utf8");
    expect(stage2Js).toContain("export function run");

    // Now stage2 should still compile the same tiny program as our stage1 e2e.
    const mathIn = resolve(stage2Dir, "math.tuff");
    await writeFile(
      mathIn,
      "module Math { fn add(a: I32, b: I32) => a + b fn mul(a: I32, b: I32) => a * b }\n",
      "utf8"
    );

    const tinyIn = resolve(stage2Dir, "tiny.tuff");
    const tinyOut = resolve(stage2Dir, "tiny.mjs");
    await writeFile(
      tinyIn,
      'extern from rt::vec use { vec_new, vec_push, vec_get, vec_set };\nfrom math use { Math };\nfn main() => { let x = Math::add(1, 2); let y = if (x == 3) { let t = Math::mul(x, 10); t } else { 0 }; let z1 = match (y) { 0 => 11, 30 => 22, _ => 33 }; let s = if (z1 == 22) { "ok" } else { "bad" }; let z2 = match (s) { "ok" => 44, _ => 55 }; let mut v = [10, 20, 30]; v[1] = v[1] + 2; z2 + v[1] }\n',
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(typeof tuffc2.run).toBe("function");
    const rcTiny = tuffc2.run([tinyIn, tinyOut]);
    expect(rcTiny).toBe(0);

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.main()).toBe(66);
  });
});
