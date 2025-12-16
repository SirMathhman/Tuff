import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

async function listFilesRec(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listFilesRec(p)));
    } else {
      out.push(p);
    }
  }
  return out;
}

describe("selfhost prebuilt sanity", () => {
  it("does not contain duplicate `tag:` object keys", async () => {
    const prebuiltDir = resolve("selfhost", "prebuilt");
    const files = (await listFilesRec(prebuiltDir)).filter((f) =>
      f.endsWith(".mjs")
    );

    // We specifically guard against the historical bug where struct literal
    // emission produced `{ tag: \"X\", tag: \"X\", ... }`.
    const dupTagRe = /tag:\s*"[^"]+"\s*,\s*tag\s*:/g;

    const offenders: Array<{ file: string; match: string }> = [];
    for (const f of files) {
      const text = await readFile(f, "utf8");
      const m = text.match(dupTagRe);
      if (m && m.length > 0) {
        offenders.push({ file: f, match: m[0] });
      }
    }

    expect(offenders, `Found duplicate tag keys in ${offenders.length} file(s)`).toEqual([]);
  });
});
