import { describe, expect, test } from "bun:test";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSelfhostCompiler } from "./helpers";

describe("selfhost tuples", () => {
  test("selfhost tuffc compiles tuple literals and .0/.1 access", async () => {
    const outDir = resolve(".dist", "selfhost", `tuples-${Date.now()}`);
    await mkdir(outDir, { recursive: true });
    const { entryFile: tuffcFile } = await buildSelfhostCompiler(outDir);

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");

    await writeFile(
      tinyIn,
      [
        "fn main() : I32 => {",
        "  let t: (I32, I32) = (1, 2);",
        "  let u = (t.0 + 10, t.1 + 20);",
        "  u.0 + u.1",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.main).toBe("function");

    const rc = tuffc.main([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.main()).toBe(33);
  });
});
