import { describe, expect, test } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function mkTempDir(prefix: string): Promise<string> {
  const base = resolve(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  await mkdir(base, { recursive: true });
  return base;
}

async function writeText(p: string, src: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, src, "utf8");
}

describe("selfhost multi-file module support (integration)", () => {
  test("out fn exports across files", async () => {
    const outDir = await mkTempDir("tuff-multifile-out");
    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir
    );
    const tuffc = (await import(pathToFileURL(tuffcFile).toString())) as any;

    const entry = resolve(outDir, "src", "main.tuff");
    const dep = resolve(outDir, "src", "util", "math.tuff");
    const outFile = resolve(outDir, "out.mjs");

    await writeText(
      dep,
      ["out fn add(first: I32, second: I32) : I32 => first + second;", ""].join(
        "\n"
      )
    );

    await writeText(
      entry,
      [
        "from src::util::math use { add };",
        "fn main() : I32 => add(1, 2);",
        "",
      ].join("\n")
    );

    const rc = tuffc.main([entry, outFile]);
    expect(rc).toBe(0);

    const mod = (await import(
      pathToFileURL(outFile).toString() + `?v=${Date.now()}`
    )) as any;
    expect(typeof mod.main).toBe("function");
    expect(mod.main()).toBe(3);
  });

  test("importing non-out symbol hard-errors", async () => {
    const outDir = await mkTempDir("tuff-multifile-nonout");
    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir
    );
    const tuffc = (await import(pathToFileURL(tuffcFile).toString())) as any;

    const entry = resolve(outDir, "src", "main.tuff");
    const dep = resolve(outDir, "src", "util", "math.tuff");
    const outFile = resolve(outDir, "out.mjs");

    await writeText(
      dep,
      ["fn add(first: I32, second: I32) : I32 => first + second;", ""].join(
        "\n"
      )
    );

    await writeText(
      entry,
      [
        "from src::util::math use { add };",
        "fn main() : I32 => add(1, 2);",
        "",
      ].join("\n")
    );

    expect(() => tuffc.main([entry, outFile])).toThrow(
      /not exported|out fn|export/i
    );
  });
});
