// Fails if any directory in the repository holds more than MAX_FILES files.
// ESLint has no rule for this, so it is checked here.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const MAX_FILES = 10;
const root = process.cwd();

/**
 * Checks one directory and recurses into its subdirectories, skipping dependencies and VCS metadata.
 *
 * @param {string} dir - The directory to check.
 * @param {{ path: string; files: number }[]} oversized - The list that collects directories over the limit.
 * @returns {{ path: string; files: number }[]} The same list, with any oversized directories added.
 */
function checkDirectory(dir, oversized) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).length;
  if (files > MAX_FILES) oversized.push({ path: relative(root, dir) || ".", files });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
    checkDirectory(join(dir, entry.name), oversized);
  }
  return oversized;
}

const oversized = checkDirectory(root, []);
if (oversized.length > 0) {
  for (const { path, files } of oversized) {
    console.error(`${path} has ${files} files; the limit is ${MAX_FILES}. Move some files into a subdirectory.`);
  }
  process.exitCode = 1;
}
