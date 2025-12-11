#!/usr/bin/env bun
// self_copy.ts - copies its own source to a new file (TypeScript version)

import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

async function main(): Promise<void> {
  try {
    // Determine current file path from ESM import.meta
    const __filename = fileURLToPath(import.meta.url);
    const sourcePath = __filename;
    const baseName = path.basename(sourcePath);
    const dirName = process.cwd();

    // Always write a consistently named copy `copy_of_<basename>`
    const targetName = `copy_of_${baseName}`;
    const targetPath = path.isAbsolute(targetName)
      ? targetName
      : path.join(dirName, targetName);

    const content = await readFile(sourcePath, "utf8");
    await writeFile(targetPath, content, { encoding: "utf8", flag: "w" });

    console.log(`Copied ${sourcePath} -> ${targetPath}`);
  } catch (err) {
    console.error("Error copying file:", err);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}

export default main;
