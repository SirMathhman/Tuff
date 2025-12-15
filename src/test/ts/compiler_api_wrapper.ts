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

import { pathToFileURL } from "node:url";

export interface ModuleStore {
  [modulePath: string]: string;
}

export interface CompileResult {
  success: boolean;
  code?: string;
  diagnostics?: string;
}

export interface LintResult {
  success: boolean;
  diagnostics?: string;
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
  // TODO: Once compiler_api.tuff exports compileCode(),
  // import the prebuilt .mjs and call it:
  //
  //   const compilerApi = await import(pathToFileURL(compilerApiMjs).toString());
  //   const result = compilerApi.compileCode(entryCode, (path) => modules[path] || "");
  //   return {
  //     success: !result.hasErrors,
  //     code: result.code,
  //     diagnostics: result.diagnosticString,
  //   };

  // For now, return a placeholder error
  return {
    success: false,
    diagnostics:
      "compileCode() not yet implemented; waiting for compiler_api.tuff",
  };
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
  // TODO: Once compiler_api.tuff exports lintCode(),
  // import the prebuilt .mjs and call it:
  //
  //   const compilerApi = await import(pathToFileURL(compilerApiMjs).toString());
  //   const result = compilerApi.lintCode(entryCode, (path) => modules[path] || "");
  //   return {
  //     success: !result.hasErrors,
  //     diagnostics: result.diagnosticString || "",
  //   };

  // For now, return a placeholder error
  return {
    success: false,
    diagnostics:
      "lintCode() not yet implemented; waiting for compiler_api.tuff",
  };
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
