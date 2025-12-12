import { describe, expect, test } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { compileAndRunTuffMain } from "../../../tools/tuff_repl";

describe("tuff repl", () => {
  test("can compile and run a tiny program (smoke)", async () => {
    const root = await (async () => {
      const base = resolve(tmpdir(), `tuff-repl-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await mkdir(base, { recursive: true });
      return base;
    })();

    const inRel = "program.tuff";
    const inAbs = resolve(root, inRel);
    await mkdir(dirname(inAbs), { recursive: true });

    await writeFile(
      inAbs,
      [
        "extern from rt::stdlib use { println };",
        "fn main() : I32 => { println(\"hello\"); 0 }",
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await compileAndRunTuffMain({
      inputFile: inAbs,
      workDir: resolve(root, ".out"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello\n");
  });
});
