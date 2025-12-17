import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

interface FluffModule {
  main: (argv: string[]) => number;
  project_error_count: () => number;
  project_warning_count: () => number;
}

function repoRootFromHere(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

export async function findBuildJsonUpwards(
  startDir: string,
  stopDir?: string
): Promise<string> {
  let dir = resolve(startDir);
  const stop = stopDir ? resolve(stopDir) : undefined;

  // Walk upwards until we find build.json, or hit stopDir/filesystem root.
  while (true) {
    const candidate = resolve(dir, "build.json");
    if (existsSync(candidate)) return candidate;

    if (stop && dir === stop) break;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return "";
}

export async function groupFilesByBuildJson(
  files: string[],
  stopDir?: string
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();

  for (const f of files) {
    const buildJson = await findBuildJsonUpwards(dirname(f), stopDir);
    const key = buildJson || "";
    const prev = out.get(key);
    if (prev) {
      prev.push(f);
    } else {
      out.set(key, [f]);
    }
  }

  return out;
}

function parseForwardedArgs(argv: string[]): { forwardedArgs: string[] } {
  // For now, we forward everything except our own flags.
  // (We don't currently have any tool-specific flags.)
  return { forwardedArgs: argv };
}

function listStagedTuffFiles(repoRoot: string): string[] {
  const out = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  return (
    out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((p) => p.endsWith(".tuff"))
      // Exclude test files that use std::test (linter doesn't resolve std:: correctly)
      .filter((p) => !p.includes("src/test/tuff/"))
      .map((p) => resolve(repoRoot, p))
  );
}

export async function main(): Promise<number> {
  const root = repoRootFromHere();
  const fluffFile = resolve(root, "selfhost", "prebuilt", "fluff.mjs");
  const fluff = (await import(
    pathToFileURL(fluffFile).toString()
  )) as FluffModule;

  if (typeof fluff.main !== "function") {
    console.error(`expected prebuilt fluff to export main(): ${fluffFile}`);
    return 1;
  }

  const staged = listStagedTuffFiles(root);
  if (staged.length === 0) {
    console.log("No staged .tuff files; skipping Tuff lint.");
    return 0;
  }

  const { forwardedArgs } = parseForwardedArgs(process.argv.slice(2));

  // Group by config so each group uses its own build.json discovery.
  const grouped = await groupFilesByBuildJson(staged, root);

  let exitCode = 0;

  for (const [, files] of grouped.entries()) {
    // Make output stable (and easier to read).
    files.sort();

    console.log(`Running Tuff linter on ${files.length} staged file(s)...`);
    const rc = fluff.main([...forwardedArgs, ...files]);
    if (rc !== 0) exitCode = rc;
  }

  return exitCode;
}

if (
  process.argv[1] &&
  process.argv[1].replaceAll("\\", "/").endsWith("tools/tuff_lint_staged.ts")
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
