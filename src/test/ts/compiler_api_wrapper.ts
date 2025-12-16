/**
 * TypeScript wrapper around the pure Tuff compiler API.
 *
 * This module provides an easy-to-use interface for tests and tools
 * to compile Tuff code without touching the filesystem.
 *
 * Usage:
 *   const modules = {
 *     "entry": "fn main() => 0",
 *     "std/prelude": "...",
 *   };
 *   const result = await compileCode(modules["entry"], (path) => modules[path] || "");
 *   if (result.success) {
 *     console.log(result.code);
 *   } else {
 *     console.error(result.diagnostics);
 *   }
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ModuleStore {
  [modulePath: string]: string;
}

export interface DiagInfo {
  line: number;
  col: number;
  start: number;
  end: number;
  msg: string;
  help: string;
}

export interface CompileResult {
  success: boolean;
  // In-memory compilation can emit multiple modules.
  outRelPaths?: string[];
  jsOutputs?: string[];
  // Convenience: entry module JS if present.
  entryJs?: string;
  diagnostics?: string;
}

export interface LintResult {
  success: boolean;
  errors?: DiagInfo[];
  warnings?: DiagInfo[];
  diagnostics?: string;
}

function prebuiltUrl(relPath: string): string {
  const abs = resolve("selfhost", "prebuilt", relPath);
  return pathToFileURL(abs).toString();
}

type TuffcLib = {
  compile_code: (
    entryCode: string,
    moduleLookup: (p: string) => string
  ) => [string[], string[]];
  lint_code: (
    entryCode: string,
    moduleLookup: (p: string) => string
  ) => [DiagInfo[], DiagInfo[]];
};

type Analyzer = {
  set_fluff_options: (
    unusedLocalsSeverity: number,
    unusedParamsSeverity: number
  ) => void;
};

let _tuffcLib: TuffcLib | null = null;
let _analyzer: Analyzer | null = null;

async function loadTuffcLib(): Promise<TuffcLib> {
  if (_tuffcLib) return _tuffcLib;
  const mod = (await import(
    prebuiltUrl("tuffc_lib.mjs")
  )) as unknown as TuffcLib;
  _tuffcLib = mod;
  return mod;
}

async function loadAnalyzer(): Promise<Analyzer> {
  if (_analyzer) return _analyzer;
  const mod = (await import(
    prebuiltUrl("analyzer.mjs")
  )) as unknown as Analyzer;
  _analyzer = mod;
  return mod;
}

export async function setFluffOptions(
  unusedLocalsSeverity: number,
  unusedParamsSeverity: number
): Promise<void> {
  const a = await loadAnalyzer();
  a.set_fluff_options(unusedLocalsSeverity | 0, unusedParamsSeverity | 0);
}

// Load an ESM module from a JS source string, without touching the filesystem.
// Useful for tests that want to execute compiled output.
//
// NOTE: This only works for modules that do not rely on relative file imports.
export async function importEsmFromSource(
  jsSource: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let src = String(jsSource);

  // When loading via `data:` URL, relative imports like "./rt/vec.mjs" cannot
  // be resolved (the base scheme is not hierarchical). Rewrite known runtime
  // imports to absolute `file:` URLs.
  const rtStdlibUrl = pathToFileURL(resolve("rt", "stdlib.mjs")).toString();
  const rtVecUrl = pathToFileURL(resolve("rt", "vec.mjs")).toString();

  src = src
    // `import { ... } from "./rt/vec.mjs"`
    .replace(/from\s+["']\.\/rt\/vec\.mjs["']/g, `from "${rtVecUrl}"`)
    .replace(/from\s+["']\.\/rt\/stdlib\.mjs["']/g, `from "${rtStdlibUrl}"`)
    // `import "./rt/vec.mjs"`
    .replace(/import\s+["']\.\/rt\/vec\.mjs["']/g, `import "${rtVecUrl}"`)
    .replace(
      /import\s+["']\.\/rt\/stdlib\.mjs["']/g,
      `import "${rtStdlibUrl}"`
    );

  const b64 = Buffer.from(src, "utf8").toString("base64");
  // Ensure a unique URL to avoid ESM cache collisions across tests.
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const url = `data:text/javascript;base64,${b64}#${nonce}`;
  return import(url);
}

/**
 * Compile entry code in-memory using a module store.
 *
 * @param entryCode - Source code of the entry module
 * @param modules - Object mapping module paths to their source code
 * @returns Compilation result with JS code or diagnostics
 */
export async function compileCode(
  entryCode: string,
  modules: ModuleStore
): Promise<CompileResult> {
  const lib = await loadTuffcLib();
  const moduleLookup = (p: string) => modules[p] ?? "";
  try {
    const [outRelPaths, jsOutputs] = lib.compile_code(entryCode, moduleLookup);
    const entryIdx = outRelPaths.indexOf("entry.mjs");
    const entryJs = entryIdx >= 0 ? jsOutputs[entryIdx] : undefined;
    return { success: true, outRelPaths, jsOutputs, entryJs };
  } catch (e) {
    return {
      success: false,
      diagnostics: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Lint (analyze) entry code in-memory using a module store.
 *
 * @param entryCode - Source code of the entry module
 * @param modules - Object mapping module paths to their source code
 * @returns Lint result with diagnostics (empty if clean)
 */
export async function lintCode(
  entryCode: string,
  modules: ModuleStore
): Promise<LintResult> {
  const lib = await loadTuffcLib();
  const moduleLookup = (p: string) => modules[p] ?? "";
  try {
    const [errors, warnings] = lib.lint_code(entryCode, moduleLookup);
    const success = errors.length === 0;
    return { success, errors, warnings };
  } catch (e) {
    return {
      success: false,
      diagnostics: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Helper to build a module store from the filesystem.
 * Useful for gradual migration: read files into memory, then use compileCode().
 *
 * @param entryPath - Path to the entry .tuff file
 * @param modulePaths - Array of module paths to load
 * @returns ModuleStore with entry and dependencies
 */
export async function buildModuleStoreFromDisk(
  entryPath: string,
  modulePaths: string[]
): Promise<ModuleStore> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const store: ModuleStore = {};

  // Load entry
  try {
    const entryCode = await fs.readFile(entryPath, "utf8");
    store["entry"] = entryCode;
  } catch (e) {
    throw new Error(`Failed to read entry file ${entryPath}: ${e}`);
  }

  // Load dependencies
  const baseDir = path.dirname(entryPath);
  for (const modPath of modulePaths) {
    try {
      const filePath = path.join(
        baseDir,
        modPath.replace(/::/g, "/") + ".tuff"
      );
      const code = await fs.readFile(filePath, "utf8");
      store[modPath] = code;
    } catch (e) {
      // Module not found is OK; will be caught by compiler
      store[modPath] = "";
    }
  }

  return store;
}
