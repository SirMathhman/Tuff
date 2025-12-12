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

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");
    await writeFile(
      tinyIn,
      "extern from rt::stdlib use { println };\nfn inc(x) => x + 1\nfn isThree(x) => x == 3\nfn main() => { println(\"start\"); let mut x = 0; while (x < 3) { println(\"loop\"); x = inc(x); } let mut r = 0; if (isThree(x)) { r = x; } else { r = 0; } println(\"end\"); r }\n",
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.main).toBe("function");

    const rc = tuffc.main([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const emitted = await readFile(tinyOut, "utf8");
    expect(emitted).toContain("export function main");

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.main()).toBe(3);
  });
});
