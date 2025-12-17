import { describe, expect, test } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost", () => {
  test("selfhost tuffc can compile a tiny program", async () => {
    const outDir = resolve(".dist", "selfhost", `case-${Date.now()}`);
    await mkdir(outDir, { recursive: true });
    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir
    );

    const mathIn = resolve(outDir, "math.tuff");
    await writeFile(
      mathIn,
      "module Math { fn add(a: I32, b: I32) : I32 => a + b fn mul(a: I32, b: I32) : I32 => a * b }\n",
      "utf8"
    );

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");
    await writeFile(
      tinyIn,
      'extern from rt::vec use { vec_new, vec_push, vec_get, vec_set };\nfrom math use { Math };\nout fn run() : I32 => { let x = Math::add(1, 2); let y = if (x == 3) { let t = Math::mul(x, 10); t } else { 0 }; let z1 = match (y) { 0 => 11, 30 => 22, _ => 33 }; let s = if (z1 == 22) { "ok" } else { "bad" }; let z2 = match (s) { "ok" => 44, _ => 55 }; let mut v = [10, 20, 30]; v[1] = v[1] + 2; z2 + v[1] }\n',
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.run).toBe("function");

    const rc = tuffc.run([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const emitted = await readFile(tinyOut, "utf8");
    expect(emitted).toContain("export function run");
    expect(emitted).toContain('import { Math } from "./math.mjs"');
    const mathOut = resolve(outDir, "math.mjs");
    const emittedMath = await readFile(mathOut, "utf8");
    expect(emittedMath).toContain("export const Math");
    expect(emittedMath).toContain("add");
    expect(emittedMath).toContain("mul");

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.run()).toBe(66);
  });
});
