import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost Char", () => {
  test("compiles and runs char literals", async () => {
    const outDir = resolve(".dist", "selfhost-char", `case-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir
    );

    // Basic char literal + escape sequence.
    const tinyIn = resolve(outDir, "tiny_char.tuff");
    const tinyOut = resolve(outDir, "tiny_char.mjs");

    await writeFile(
      tinyIn,
      "fn main() => { let a: Char = 'A'; let b: Char = '\\n'; a + b }\n",
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.main).toBe("function");

    const rc = tuffc.main([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    // 'A' == 65, '\n' == 10
    expect(tinyMod.main()).toBe(75);
  });
});
