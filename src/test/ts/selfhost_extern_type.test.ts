import { describe, expect, test } from "vitest";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost extern type", () => {
  test("selfhost tuffc accepts `extern type` declarations", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-extern-type",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir
    );

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");

    await writeFile(
      tinyIn,
      [
        "extern type Foo<T>",
        "",
        "fn idFoo(x: Foo<I32>) : I32 => 0",
        "",
        "fn main() : I32 => 0",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof (tuffc as any).main).toBe("function");

    const rc = (tuffc as any).main([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const js = await readFile(tinyOut, "utf8");
    expect(js).toContain("export function main");
  });
});
