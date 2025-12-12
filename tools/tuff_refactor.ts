import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type MoveFileAndUpdateImportsOptions = {
  projectRoot: string;
  oldFilePath: string; // project-relative or absolute
  newFilePath: string; // project-relative or absolute
  scanRoots?: string[]; // directories (project-relative) to scan, default ["src"]
  dryRun?: boolean;
};

function repoRootFromHere(): string {
  // tools/*.ts -> repo root
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

function normalizeSeps(p: string): string {
  return p.replace(/\\/g, "/");
}

export function relpathToModulePath(relPath0: string): string {
  // Mirrors src/main/tuff/compiler/refactor_move_file.tuff
  const relPath = normalizeSeps(relPath0);
  const p1 = relPath.startsWith("./") ? relPath.slice(2) : relPath;
  const p2 = p1.endsWith(".tuff") ? p1.slice(0, -".tuff".length) : p1;
  return p2.replaceAll("/", "::");
}

function escapeRegExp(s: string): string {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteImportModulePaths(
  source: string,
  oldModulePath: string,
  newModulePath: string
): { updated: string; changed: boolean } {
  if (oldModulePath === newModulePath) {
    return { updated: source, changed: false };
  }

  const oldEsc = escapeRegExp(oldModulePath);

  // from <module> use ...
  const reFrom = new RegExp(`\\bfrom\\s+${oldEsc}(?=\\s+use\\b)`, "g");
  // extern from <module> use ...
  const reExternFrom = new RegExp(
    `\\bextern\\s+from\\s+${oldEsc}(?=\\s+use\\b)`,
    "g"
  );

  const updated = source
    .replace(reFrom, `from ${newModulePath}`)
    .replace(reExternFrom, `extern from ${newModulePath}`);

  return { updated, changed: updated !== source };
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listTuffFilesRec(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listTuffFilesRec(full)));
      continue;
    }
    if (ent.isFile() && full.endsWith(".tuff")) {
      out.push(full);
    }
  }
  return out;
}

function toProjectRelative(projectRoot: string, p: string): string {
  const abs = resolve(projectRoot, p);
  // Make stable across platforms.
  return normalizeSeps(relative(projectRoot, abs));
}

export async function moveFileAndUpdateImports(
  opts: MoveFileAndUpdateImportsOptions
): Promise<{ updatedFiles: string[]; oldModulePath: string; newModulePath: string }> {
  const projectRoot = resolve(opts.projectRoot);
  const scanRoots = opts.scanRoots?.length ? opts.scanRoots : ["src"];

  const oldRel = toProjectRelative(projectRoot, opts.oldFilePath);
  const newRel = toProjectRelative(projectRoot, opts.newFilePath);

  const oldAbs = resolve(projectRoot, oldRel);
  const newAbs = resolve(projectRoot, newRel);

  if (!(await exists(oldAbs))) {
    throw new Error(`old file does not exist: ${oldRel}`);
  }

  const oldModulePath = relpathToModulePath(oldRel);
  const newModulePath = relpathToModulePath(newRel);

  if (!opts.dryRun) {
    await mkdir(dirname(newAbs), { recursive: true });
    await rename(oldAbs, newAbs);
  }

  const updatedFiles: string[] = [];

  for (const rootRel of scanRoots) {
    const scanAbs = resolve(projectRoot, rootRel);
    if (!(await exists(scanAbs))) continue;

    const files = await listTuffFilesRec(scanAbs);
    for (const file of files) {
      const src = await readFile(file, "utf8");
      const { updated, changed } = rewriteImportModulePaths(
        src,
        oldModulePath,
        newModulePath
      );
      if (!changed) continue;
      updatedFiles.push(file);
      if (!opts.dryRun) {
        await writeFile(file, updated, "utf8");
      }
    }
  }

  return { updatedFiles, oldModulePath, newModulePath };
}

function printUsage(): void {
  // Keep it simple: no external arg parser dependency.
  // eslint-disable-next-line no-console
  console.log(
    [
      "tuff-refactor usage:",
      "  tuff-refactor move-file --from <oldRel> --to <newRel> [--root <dir>] [--dry-run]",
      "",
      "Examples:",
      "  tuff-refactor move-file --from src/main/tuff/compiler/foo.tuff --to src/main/tuff/compiler/bar/foo.tuff",
    ].join("\n")
  );
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

export async function main(argv: string[]): Promise<number> {
  const args = [...argv];
  const cmd = args.shift();

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printUsage();
    return 0;
  }

  if (cmd !== "move-file") {
    throw new Error(`unknown command: ${cmd}`);
  }

  const from = getArg(args, "--from");
  const to = getArg(args, "--to");
  const root = getArg(args, "--root");
  const dryRun = args.includes("--dry-run");

  if (!from || !to) {
    printUsage();
    return 1;
  }

  const projectRoot = process.cwd();

  await moveFileAndUpdateImports({
    projectRoot,
    oldFilePath: from,
    newFilePath: to,
    scanRoots: root ? [root] : ["src"],
    dryRun,
  });

  return 0;
}

if (process.argv[1] && normalizeSeps(process.argv[1]).endsWith("tools/tuff_refactor.ts")) {
  // Running via tsx.
  main(process.argv.slice(2)).then(
    (rc) => {
      process.exitCode = rc;
    },
    (e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exitCode = 1;
    }
  );
}

// Ensure repoRootFromHere isn't tree-shaken in some bundlers; also handy for future features.
void repoRootFromHere;
