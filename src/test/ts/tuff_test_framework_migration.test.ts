import { describe, expect, test } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("tuff std::test migration", () => {
  test("runs a small Tuff-authored test suite", async () => {
    const outDir = resolve(".dist", "tuff-tests", `case-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      {
        includeStd: true,
      }
    );

    const testsIn = resolve(outDir, "run_tests.tuff");
    const testsOut = resolve(outDir, "run_tests.mjs");

    await writeFile(
      testsIn,
      [
        "extern from rt::stdlib use { println };",
        "from std::test use { reset, suite, it, expect_eq, expect_ne, expect_true, expect_false, expect_lt, expect_le, expect_gt, expect_ge, summary, status };",
        "",
        "type Option<T> = Some<T> | None;",
        "",
        "struct Point {",
        "  x: I32,",
        "  y: I32",
        "}",
        "",
        "fn main() => {",
        "  reset();",
        "",
        '  suite("literals");',
        "  it(\"char literals\", expect_eq(\"A + \\\\n\", ('A' + '\\n'), 75));",
        "",
        '  suite("tuples");',
        "  let tuple_val = (1, 2);",
        '  it("tuple access", expect_eq("tuple sum", (tuple_val.0 + tuple_val.1), 3));',
        "",
        '  suite("structs + unions");',
        "  let mut point = Point { 10, 20 };",
        "  point.x = point.x + 1;",
        "  let opt = Some(42);",
        '  it("struct+union calc", expect_eq("calc", (if (opt.tag == "Some") { point.x + point.y + opt.value } else { 0 }), 73));',
        "",
        '  suite("comparisons");',
        '  it("lt", expect_lt("1 < 2", 1, 2));',
        '  it("le", expect_le("2 <= 2", 2, 2));',
        '  it("gt", expect_gt("3 > 2", 3, 2));',
        '  it("ge", expect_ge("2 >= 2", 2, 2));',
        '  it("ne", expect_ne("1 != 2", 1, 2));',
        '  it("true", expect_true("true", true));',
        '  it("false", expect_false("false", false));',
        "",
        "  summary();",
        "  status()",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.run).toBe("function");

    const rcCompile = tuffc.run([testsIn, testsOut]);
    expect(rcCompile).toBe(0);

    const testsMod = await import(pathToFileURL(testsOut).toString());
    expect(typeof testsMod.main).toBe("function");

    const rcTests = testsMod.main();
    expect(rcTests).toBe(0);
  });
});
