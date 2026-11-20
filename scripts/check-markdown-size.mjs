// Fails if any Markdown file in the repository has more than MAX_CHARS characters.
// A file over the limit must be split into smaller files under docs/.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const MAX_CHARS = 10_000;
const root = process.cwd();

/**
 * Collects every Markdown file under a directory, skipping dependencies and VCS metadata.
 *
 * @param {string} dir - The directory to search.
 * @param {string[]} found - The list that collects matching paths.
 * @returns {string[]} The same list, with the matching paths added.
 */
function collectMarkdown(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(path, found);
    else if (entry.name.endsWith(".md")) found.push(path);
  }
  return found;
}

const oversized = [];
for (const file of collectMarkdown(root, [])) {
  const chars = [...readFileSync(file, "utf8")].length;
  if (chars > MAX_CHARS) oversized.push({ file: relative(root, file), chars });
}

if (oversized.length > 0) {
  for (const { file, chars } of oversized) {
    console.error(`${file} has ${chars} characters; the limit is ${MAX_CHARS}. Split it under docs/.`);
  }
  process.exitCode = 1;
}
