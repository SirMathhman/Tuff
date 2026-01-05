import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildOutMain } from "../../main/ts/tools/out_builder";

async function readText(p: string): Promise<string> {
  return await readFile(p, "utf8");
}

function makeTempRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuff-out-"));
  const srcMainTs = path.join(root, "src", "main", "ts");
  const srcMainTuff = path.join(root, "src", "main", "tuff");
  const outRoot = path.join(root, "out");

  return { root, srcMainTs, srcMainTuff, outRoot };
}

describe("out builder", () => {
  it("should merge src/main/ts and src/main/tuff into out/main and out/main/ts", async () => {
    const { root, srcMainTs, srcMainTuff, outRoot } = makeTempRepo();

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

  it("should let Tuff override copied TS modules for gradual migration", async () => {
    const { root, srcMainTs, srcMainTuff, outRoot } = makeTempRepo();

    await mkdir(path.join(srcMainTs, "common"), { recursive: true });
    await mkdir(path.join(srcMainTuff, "common"), { recursive: true });

    // Copied TS version (should be overwritten)
    writeFileSync(
      path.join(srcMainTs, "common", "span.ts"),
      "export interface Span { ts: true }\n",
      "utf8"
    );

    // Tuff version (should win)
    writeFileSync(
      path.join(srcMainTuff, "common", "span.tuff"),
      "out struct Span { tuff: I32 }\n",
      "utf8"
    );

    await buildOutMain({ repoRoot: root, outRoot });

    const merged = await readText(
      path.join(outRoot, "main", "ts", "common", "span.ts")
    );
    expect(merged).toContain("export interface Span");
    expect(merged).toContain("tuff: number");
    expect(merged).not.toContain("ts: true");
  });
});
