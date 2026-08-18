/**
 * Fails if any git-tracked directory has more than MAX_CHILDREN immediate
 * children (files or subdirectories, as seen on disk). node_modules is
 * counted as a child but never recursed into. The .git directory is ignored.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_CHILDREN = 15;
/** Directories never recursed into (still counted as a child of their parent). */
const NO_RECURSE = new Set(["node_modules", ".git"]);

/** Directories that contain at least one git-tracked file, plus the root. */
function trackedDirs(): Set<string> {
  const dirs = new Set<string>(["."]);
  const res = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  if (res.status !== 0) return dirs;
  for (const line of res.stdout.split("\n")) {
    const file = line.trim();
    if (file === "") continue;
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
}

function countChildren(dir: string): number {
  return readdirSync(dir).filter((name) => name !== ".git").length;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir: string, tracked: Set<string>, offenders: string[]): void {
  const rel = dir === "." ? "." : dir;
  if (tracked.has(rel)) {
    const count = countChildren(dir);
    if (count > MAX_CHILDREN) {
      offenders.push(`${rel}: ${count} children (max ${MAX_CHILDREN})`);
    }
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (NO_RECURSE.has(name)) continue;
    const child = join(dir, name);
    if (isDir(child)) walk(child, tracked, offenders);
  }
}

const tracked = trackedDirs();
const offenders: string[] = [];
walk(".", tracked, offenders);

if (offenders.length > 0) {
  console.error(
    `Too many immediate children in ${offenders.length} director${offenders.length === 1 ? "y" : "ies"}:`,
  );
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log("OK: no directory exceeds the child limit.");
