// Fails if any directory directly contains more than MAX_FILES files. Subdirectories are not counted.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const MAX_FILES = 10;
const SKIPPED = new Set(["node_modules", ".git"]);

/**
 * Checks one directory, then each subdirectory, and reports every directory over the limit.
 *
 * @param dir - The directory to check.
 * @returns The directories over the limit, each with its file count.
 */
function overLimit(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const here = files.length > MAX_FILES ? [{ dir, count: files.length }] : [];
  const nested = entries
    .filter((entry) => entry.isDirectory() && !SKIPPED.has(entry.name))
    .flatMap((entry) => overLimit(join(dir, entry.name)));
  return [...here, ...nested];
}

const violations = overLimit(".");
if (violations.length > 0) {
  for (const { dir, count } of violations) {
    console.error(`${dir}: ${count} files (max ${MAX_FILES} per directory, excluding subdirectories)`);
  }
  process.exit(1);
}
console.log(`file count: every directory has at most ${MAX_FILES} files`);
