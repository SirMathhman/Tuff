import { describe, expect, test } from "bun:test";
import { compileToESM } from "../src/index";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

describe("tuples", () => {
  test("tuple literal and .0/.1 access work", async () => {
    const { js, diagnostics } = compileToESM({
      filePath: "/virtual/tuples.tuff",
      source: [
        "fn main() : I32 => {",
        "  let t: (I32, I32) = (1, 2);",
        "  let u = (t.0 + 10, t.1 + 20);",
        "  u.0 + u.1",
        "}",
        "",
      ].join("\n"),
    });

    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        errors
          .map(
            (e) =>
              `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
                e.span?.col ?? "?"
              } ${e.message}`
          )
          .join("\n")
      );
    }

    const outDir = resolve(".dist", "tuples", `case-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const outFile = resolve(outDir, "prog.mjs");
    await writeFile(outFile, js, "utf8");

    const mod = await import(pathToFileURL(outFile).toString());
    expect(mod.main()).toBe(33);
  });

  test("nested tuple access works", async () => {
    const { js, diagnostics } = compileToESM({
      filePath: "/virtual/tuples_nested.tuff",
      source: [
        "fn main() : I32 => {",
        "  let n: ((I32, I32), I32) = ((1, 2), 3);",
        "  n.0.1 + n.1",
        "}",
        "",
      ].join("\n"),
    });

    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        errors
          .map(
            (e) =>
              `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
                e.span?.col ?? "?"
              } ${e.message}`
          )
          .join("\n")
      );
    }

    const outDir = resolve(".dist", "tuples", `nested-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const outFile = resolve(outDir, "prog.mjs");
    await writeFile(outFile, js, "utf8");

    const mod = await import(pathToFileURL(outFile).toString());
    expect(mod.main()).toBe(5);
  });
});
