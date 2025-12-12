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

describe("selfhost types", () => {
  test("selfhost tuffc accepts type annotations and generics", async () => {
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

    const outDir = resolve(".dist", "selfhost", `types-${Date.now()}`);
    await mkdir(outDir, { recursive: true });
    await writeRuntime(outDir);

    const tuffcFile = resolve(outDir, "tuffc.mjs");
    await writeFile(tuffcFile, js, "utf8");

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");

    await writeFile(
      tinyIn,
      [
        "type Option<T> = Some<T> | None;",
        "",
        "struct Point {",
        "  x: I32,",
        "  y: I32",
        "}",
        "",
        "fn add(a: I32, b: I32) : I32 => a + b",
        "fn id<T>(x: T) : T => x",
        "",
        "fn main() : I32 => {",
        "  let p: Point = Point { 1, 2 };",
        "  let n: I32 = add(p.x, p.y);",
        "  let o: Option<I32> = Some(n);",
        '  (if (o.tag == "Some") { id<I32>(o.value) } else { 0 })',
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
    expect(tinyMod.main()).toBe(3);
  });
});
