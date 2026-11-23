import { readdirSync } from "node:fs";
import path from "node:path";

const MAX_FILES = 10;
const SKIPPED = ["node_modules", ".git"];

function overLimit(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const fileCount = entries.filter((entry) => entry.isFile()).length;
  const own =
    fileCount > MAX_FILES
      ? [`${dir} has ${fileCount} files (max ${MAX_FILES})`]
      : [];

  return entries
    .filter((entry) => entry.isDirectory() && !SKIPPED.includes(entry.name))
    .reduce<string[]>(
      (acc, entry) => [...acc, ...overLimit(path.join(dir, entry.name))],
      own,
    );
}

const violations = overLimit(process.cwd());

violations.forEach((violation) => console.error(violation));

process.exitCode = violations.length === 0 ? 0 : 1;
