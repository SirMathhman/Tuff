import { describe, expect, test } from "bun:test";

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSelfhostCompiler } from "./helpers";

describe("selfhost stage2", () => {
  test("selfhost tuffc can compile itself (stage2) and still compile a tiny program", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-stage2",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    // Stage 1: bootstrap-compiled selfhost compiler (multi-file)
    const { entryFile: stage1File } = await buildSelfhostCompiler(outDir);

    // Stage 2: use stage1 to compile the selfhost compiler source again
    const stage2In = resolve("selfhost", "tuffc.tuff");
    const stage2Out = resolve(outDir, "tuffc.stage2.mjs");

    const tuffc1 = await import(pathToFileURL(stage1File).toString());
    expect(typeof tuffc1.main).toBe("function");
    const rc2 = tuffc1.main([stage2In, stage2Out]);
    expect(rc2).toBe(0);

    const stage2Js = await readFile(stage2Out, "utf8");
    expect(stage2Js).toContain("export function main");

    // Now stage2 should still compile the same tiny program as our stage1 e2e.
    const mathIn = resolve(outDir, "math.tuff");
    await writeFile(
      mathIn,
      "module Math { fn add(a, b) => a + b fn mul(a, b) => a * b }\n",
      "utf8"
    );

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");
    await writeFile(
      tinyIn,
      'extern from rt::vec use { vec_new, vec_push, vec_get, vec_set };\nfrom math use { Math };\nfn main() => { let x = Math::add(1, 2); let y = if (x == 3) { let t = Math::mul(x, 10); t } else { 0 }; let z1 = match (y) { 0 => 11, 30 => 22, _ => 33 }; let s = if (z1 == 22) { "ok" } else { "bad" }; let z2 = match (s) { "ok" => 44, _ => 55 }; let mut v = [10, 20, 30]; v[1] = v[1] + 2; z2 + v[1] }\n',
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(typeof tuffc2.main).toBe("function");
    const rcTiny = tuffc2.main([tinyIn, tinyOut]);
    expect(rcTiny).toBe(0);

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.main()).toBe(66);
  });
});
