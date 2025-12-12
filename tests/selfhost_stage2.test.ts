import { describe, expect, test } from "bun:test";
import { compileToESM } from "../src/index";

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

describe("selfhost stage2", () => {
  test("selfhost tuffc can compile itself (stage2) and still compile a tiny program", async () => {
    const src = await readFile(resolve("selfhost/tuffc.tuff"), "utf8");
    const { js, diagnostics } = compileToESM({
      filePath: resolve("selfhost/tuffc.tuff"),
      source: src,
    });
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        [
          "bootstrap compiler failed to compile selfhost/tuffc.tuff:",
          ...errors.map(
            (e) =>
              `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
                e.span?.col ?? "?"
              } ${e.message}`
          ),
        ].join("\n")
      );
    }

    const outDir = resolve(
      ".dist",
      "selfhost-stage2",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });
    await writeRuntime(outDir);

    // Stage 1: bootstrap-compiled selfhost compiler
    const stage1File = resolve(outDir, "tuffc.stage1.mjs");
    await writeFile(stage1File, js, "utf8");

    // Stage 2: use stage1 to compile the selfhost compiler source again
    const stage2In = resolve(outDir, "tuffc.tuff");
    await writeFile(stage2In, src, "utf8");
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
      'extern from rt::vec use { vec_new, vec_push, vec_get, vec_set };\nimport math;\nfn main() => { let x = math::Math::add(1, 2); let y = if (x == 3) { let t = math::Math::mul(x, 10); t } else { 0 }; let z1 = match (y) { 0 => 11, 30 => 22, _ => 33 }; let s = if (z1 == 22) { "ok" } else { "bad" }; let z2 = match (s) { "ok" => 44, _ => 55 }; let mut v = [10, 20, 30]; v[1] = v[1] + 2; z2 + v[1] }\n',
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
