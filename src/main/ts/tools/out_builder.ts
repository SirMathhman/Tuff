import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DiagnosticReporter } from "../common/diagnostics.js";
import { compileSource, getTypeScriptOutputPath } from "../compiler/compile.js";
import { emitTypeScript } from "../compiler/emit_ts.js";

export interface BuildOutMainOptions {
  repoRoot: string;
  outRoot?: string;
}

export async function buildOutMain(
  options: BuildOutMainOptions
): Promise<void> {
  const repoRoot = options.repoRoot;
  const outRoot = options.outRoot ?? path.join(repoRoot, "out");

  const srcMainTs = path.join(repoRoot, "src", "main", "ts");
  const srcMainTuff = path.join(repoRoot, "src", "main", "tuff");

  const outMain = path.join(outRoot, "main");
  const outMainTs = path.join(outMain, "ts");

  // Clean output for deterministic merges.
  await rm(outMain, { recursive: true, force: true });
  await mkdir(outMainTs, { recursive: true });

  // 1) Copy Stage-0 TS sources directly.
  if (existsSync(srcMainTs)) {
    copyDir(srcMainTs, outMainTs, (p) => p.endsWith(".ts"));
  }

  // 2) Compile each .tuff file to .ts into out/main/ts (mirroring layout under src/main/tuff).
  if (existsSync(srcMainTuff)) {
    // 3) Compile each .tuff file to .ts into out/main/ts (mirroring layout under src/main/tuff).
    const tuffFiles = listFilesRecursive(srcMainTuff).filter((p) =>
      p.toLowerCase().endsWith(".tuff")
    );

    for (const absTuff of tuffFiles) {
      const rel = path.relative(srcMainTuff, absTuff);
      const relTs = getTypeScriptOutputPath(rel);
      const outTsPath = path.join(outMainTs, relTs);

      const source = readText(absTuff);
      const reporter = new DiagnosticReporter();
      const program = compileSource(source, absTuff, reporter);

      if (reporter.hasErrors()) {
        // Reporter already printed diagnostics.
        throw new Error(`Failed to compile ${absTuff}`);
      }

      const ts = emitTypeScript(program);
      await mkdir(path.dirname(outTsPath), { recursive: true });
      await writeFile(outTsPath, ts, "utf8");
    }
  }
}

function copyDir(
  srcDir: string,
  dstDir: string,
  include: (absPath: string) => boolean
) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      if (!existsSync(dst)) {
        mkdirSyncRecursive(dst);
      }
      copyDir(src, dst, include);
      continue;
    }

    if (entry.isFile()) {
      if (include(src)) {
        mkdirSyncRecursive(path.dirname(dst));
        copyFileSync(src, dst);
      }
    }
  }
}

function mkdirSyncRecursive(dir: string) {
  if (existsSync(dir)) return;
  const parent = path.dirname(dir);
  if (parent !== dir) mkdirSyncRecursive(parent);
  try {
    mkdirSync(dir);
  } catch {
    // ignore races
  }
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(abs));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

function readText(p: string): string {
  return readFileSync(p, "utf8");
}

async function main() {
  const repoRoot = process.cwd();
  await buildOutMain({ repoRoot });
  console.log(
    `Built out/main and out/main/ts under ${path.join(repoRoot, "out")}`
  );
}

// ESM-friendly "is main" check.
const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
