import { describe, expect, test } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// These will be added to rt/stdlib.(ts|mjs)
import {
  copyFile,
  listFilesRecursive,
  listTestTuffFiles,
  runTuffModule,
  runTuffTestModule,
} from "../../../rt/stdlib";

describe("rt/stdlib test-runner infra", () => {
  test("listTestTuffFiles finds **/*.test.tuff recursively", () => {
    const root = mkdtempSync(join(tmpdir(), "tuff-rt-stdlib-"));

    // layout:
    // root/a.test.tuff
    // root/a.tuff
    // root/nested/b.test.tuff
    // root/nested/deeper/c.test.tuff
    // root/nested/deeper/c.test.txt
    mkdirSync(join(root, "nested", "deeper"), { recursive: true });

    writeFileSync(join(root, "a.test.tuff"), "// ok\n", "utf8");
    writeFileSync(join(root, "a.tuff"), "// no\n", "utf8");
    writeFileSync(join(root, "nested", "b.test.tuff"), "// ok\n", "utf8");
    writeFileSync(
      join(root, "nested", "deeper", "c.test.tuff"),
      "// ok\n",
      "utf8"
    );
    writeFileSync(
      join(root, "nested", "deeper", "c.test.txt"),
      "// no\n",
      "utf8"
    );

    const found = listTestTuffFiles(root)
      .map((p: string) => resolve(p))
      .sort();

    expect(found).toEqual(
      [
        resolve(join(root, "a.test.tuff")),
        resolve(join(root, "nested", "b.test.tuff")),
        resolve(join(root, "nested", "deeper", "c.test.tuff")),
      ].sort()
    );
  });

  test("runTuffTestModule executes an ESM module's exported main()", () => {
    const root = mkdtempSync(join(tmpdir(), "tuff-rt-stdlib-run-"));

    const passFile = join(root, "pass.mjs");
    writeFileSync(
      passFile,
      ["export function main() {", "  return 0;", "}"].join("\n"),
      "utf8"
    );

    const failFile = join(root, "fail.mjs");
    writeFileSync(
      failFile,
      ["export function main() {", "  return 7;", "}"].join("\n"),
      "utf8"
    );

    expect(runTuffTestModule(passFile)).toBe(0);
    expect(runTuffTestModule(failFile)).toBe(7);
  });

  test("runTuffModule passes argv to main(argv)", () => {
    const root = mkdtempSync(join(tmpdir(), "tuff-rt-stdlib-runargv-"));

    const file = join(root, "echo.mjs");
    writeFileSync(
      file,
      [
        "export function main(argv) {",
        "  // Vec<String> is a JS array in the JS runtime.",
        "  return argv.length;",
        "}",
      ].join("\n"),
      "utf8"
    );

    expect(runTuffModule(file, [])).toBe(0);
    expect(runTuffModule(file, ["a", "b", "c"])).toBe(3);
  });

  test("listFilesRecursive returns all files under a directory", () => {
    const root = mkdtempSync(join(tmpdir(), "tuff-rt-stdlib-listall-"));
    mkdirSync(join(root, "a", "b"), { recursive: true });
    writeFileSync(join(root, "root.txt"), "1", "utf8");
    writeFileSync(join(root, "a", "a.txt"), "2", "utf8");
    writeFileSync(join(root, "a", "b", "b.txt"), "3", "utf8");

    const found = listFilesRecursive(root)
      .map((p: string) => resolve(p))
      .sort();

    expect(found).toEqual(
      [
        resolve(join(root, "root.txt")),
        resolve(join(root, "a", "a.txt")),
        resolve(join(root, "a", "b", "b.txt")),
      ].sort()
    );
  });

  test("copyFile copies a file and creates parent directories", () => {
    const root = mkdtempSync(join(tmpdir(), "tuff-rt-stdlib-copy-"));
    const src = join(root, "src.txt");
    const dst = join(root, "nested", "dst.txt");
    writeFileSync(src, "hello", "utf8");

    copyFile(src, dst);
    expect(readFileSync(dst, "utf8")).toBe("hello");
  });
});
