import { describe, expect, test } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  findBuildJsonUpwards,
  groupFilesByBuildJson,
} from "../../../tools/tuff_lint_staged";

describe("tuff_lint_staged helpers", () => {
  test("groups files by nearest build.json", async () => {
    const base = resolve(
      ".dist",
      "tuff-lint-staged-grouping",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const a = resolve(base, "a");
    const ab = resolve(base, "a", "b");
    const c = resolve(base, "c");
    const cd = resolve(base, "c", "d");

    await mkdir(ab, { recursive: true });
    await mkdir(cd, { recursive: true });

    const buildA = resolve(a, "build.json");
    const buildC = resolve(c, "build.json");

    await writeFile(buildA, JSON.stringify({ fluff: { unusedLocals: "off" } }));
    await writeFile(
      buildC,
      JSON.stringify({ fluff: { unusedLocals: "warning" } })
    );

    const f1 = resolve(ab, "one.tuff");
    const f2 = resolve(ab, "two.tuff");
    const f3 = resolve(cd, "three.tuff");

    await writeFile(f1, "fn main() : I32 => 0\n");
    await writeFile(f2, "fn main() : I32 => 0\n");
    await writeFile(f3, "fn main() : I32 => 0\n");

    expect(await findBuildJsonUpwards(ab, base)).toBe(buildA);
    expect(await findBuildJsonUpwards(cd, base)).toBe(buildC);

    const grouped = await groupFilesByBuildJson([f1, f2, f3], base);
    expect(Array.from(grouped.keys()).sort()).toEqual([buildA, buildC].sort());

    expect(grouped.get(buildA)?.sort()).toEqual([f1, f2].sort());
    expect(grouped.get(buildC)?.sort()).toEqual([f3].sort());
  });
});
