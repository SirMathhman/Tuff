import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildOutMain } from "../../main/ts/tools/out_builder";

async function readText(p: string): Promise<string> {
  return await readFile(p, "utf8");
}

describe("out builder", () => {
  it("should merge src/main/ts and src/main/tuff into out/main and out/main/ts", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "tuff-out-"));

    const srcMainTs = path.join(root, "src", "main", "ts");
    const srcMainTuff = path.join(root, "src", "main", "tuff");

    await mkdir(path.join(srcMainTs, "a"), { recursive: true });
    await mkdir(path.join(srcMainTuff, "pkg"), { recursive: true });

    writeFileSync(
      path.join(srcMainTs, "a", "hello.ts"),
      "export const hello = 123;\n",
      "utf8"
    );

    writeFileSync(
      path.join(srcMainTuff, "pkg", "mod.tuff"),
      "out let x: I32 = 10;\n",
      "utf8"
    );

    const outRoot = path.join(root, "out");

    await buildOutMain({ repoRoot: root, outRoot });

    const copiedTs = await readText(
      path.join(outRoot, "main", "ts", "a", "hello.ts")
    );
    expect(copiedTs).toBe("export const hello = 123;\n");

    const compiledTs = await readText(
      path.join(outRoot, "main", "ts", "pkg", "mod.ts")
    );
    expect(compiledTs).toContain("export const x: number = 10;");
  });
});
