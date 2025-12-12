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

describe("selfhost", () => {
  test("selfhost tuffc can compile a tiny program", async () => {
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

    const outDir = resolve(".dist", "selfhost", `case-${Date.now()}`);
    await mkdir(outDir, { recursive: true });
    await writeRuntime(outDir);

    const tuffcFile = resolve(outDir, "tuffc.mjs");
    await writeFile(tuffcFile, js, "utf8");

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
      'import math;\nfn main() => { let x = math::Math::add(1, 2); let y = if (x == 3) { let t = math::Math::mul(x, 10); t } else { 0 }; let z1 = match (y) { 0 => 11, 30 => 22, _ => 33 }; let s = if (z1 == 22) { "ok" } else { "bad" }; let z2 = match (s) { "ok" => 44, _ => 55 }; z2 }\n',
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.main).toBe("function");

    const rc = tuffc.main([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const emitted = await readFile(tinyOut, "utf8");
    expect(emitted).toContain("export function main");
    expect(emitted).toContain('import * as math from "./math.mjs"');
    const mathOut = resolve(outDir, "math.mjs");
    const emittedMath = await readFile(mathOut, "utf8");
    expect(emittedMath).toContain("export const Math");
    expect(emittedMath).toContain("add");
    expect(emittedMath).toContain("mul");

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.main()).toBe(44);
  });
});
