import { describe, expect, test } from "vitest";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { moveFileAndUpdateImports } from "../../../tools/tuff_refactor";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("tuff refactor CLI", () => {
  test("move-file moves file and updates from/extern-from module paths", async () => {
    const root = await (async () => {
      const base = resolve(
        tmpdir(),
        `tuff-refactor-${Date.now()}-${Math.random().toString(16).slice(2)}`
      );
      await mkdir(base, { recursive: true });
      return base;
    })();

    const oldRel = "src/main/tuff/foo/a.tuff";
    const newRel = "src/main/tuff/bar/a.tuff";

    const oldAbs = resolve(root, oldRel);
    const newAbs = resolve(root, newRel);

    await mkdir(dirname(oldAbs), { recursive: true });
    await writeFile(
      oldAbs,
      [
        "extern from rt::stdlib use { println };",
        'fn main() : I32 => { println("moved"); 0 }',
        "",
      ].join("\n"),
      "utf8"
    );

    const importer1 = resolve(root, "src/main/tuff/app/app.tuff");
    await mkdir(dirname(importer1), { recursive: true });
    await writeFile(
      importer1,
      [
        "from src::main::tuff::foo::a use { a };",
        "extern from src::main::tuff::foo::a use { a };",
        "extern from src::main::tuff::foo::a use { b, c };",
        "from src::main::tuff::foo::other use { x };",
        "fn main() : I32 => 0",
        "",
      ].join("\n"),
      "utf8"
    );

    const res = await moveFileAndUpdateImports({
      projectRoot: root,
      oldFilePath: oldRel,
      newFilePath: newRel,
      scanRoots: ["src"],
    });

    expect(res.oldModulePath).toBe("src::main::tuff::foo::a");
    expect(res.newModulePath).toBe("src::main::tuff::bar::a");
    expect(res.updatedFiles).toContain(importer1);

    expect(await exists(oldAbs)).toBe(false);
    expect(await exists(newAbs)).toBe(true);

    const updated = await readFile(importer1, "utf8");
    expect(updated).toContain("from src::main::tuff::bar::a use");
    expect(updated).toContain("extern from src::main::tuff::bar::a use");
    expect(updated).toContain("from src::main::tuff::foo::other use");
    expect(updated).not.toContain("src::main::tuff::foo::a use");
  });
});
