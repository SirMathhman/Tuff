import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Reports every directory that directly contains more than MAX_FILES files, of
// any type. Subdirectories are not counted toward a directory's total. Generated
// and version-control directories are skipped.
// Usage: bun scripts/max-files-per-dir.ts

const MAX_FILES = 10;
const SKIPPED = new Set([".git", "node_modules"]);

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Count {
  dir: string;
  files: number;
}

const counts: Count[] = [];
const pending: string[] = [projectRoot];
while (pending.length > 0) {
  const dir = pending.pop() ?? projectRoot;
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) pending.push(join(dir, entry.name));
    } else {
      files++;
    }
  }
  counts.push({ dir, files });
}

const offenders = counts.filter((count) => count.files > MAX_FILES);
for (const offender of offenders) {
  const shown = relative(projectRoot, offender.dir) || ".";
  console.log(
    `${shown}: ${offender.files} files; a directory may hold at most ${MAX_FILES} files (subdirectories excluded).`,
  );
}
process.exitCode = offenders.length > 0 ? 1 : 0;
