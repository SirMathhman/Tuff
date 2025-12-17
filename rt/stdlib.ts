// Tuff runtime stdlib (TypeScript source)
//
// This is intentionally tiny: just enough for a self-hosted compiler.
// The bootstrap compiler can import this via:
//   extern from rt::stdlib use { ... }

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

export function print(s: string): void {
  process.stdout.write(String(s));
}

export function println(s: string): void {
  process.stdout.write(String(s) + "\n");
}

export function panic(message: string): never {
  throw new Error(String(message));
}

export function readTextFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function writeTextFile(path: string, data: string): void {
  // Create parent directories automatically for convenience.
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, "utf8");
}

export function mkdirp(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function pathDirname(path: string): string {
  return dirname(path);
}

export function pathBasename(path: string): string {
  return basename(path);
}

export function pathJoin(a: string, b: string): string {
  return join(a, b);
}

export function pathResolve(path: string): string {
  return resolve(path);
}

export function cwd(): string {
  return process.cwd();
}

export function args(): string[] {
  // return user args (skip bun/node + script)
  return process.argv.slice(2);
}

export function exit(code: number): never {
  process.exit(code);
}

// ---- String helpers (bootstrap) ----

export function stringLen(s: string): number {
  return String(s).length;
}

export function stringSlice(s: string, start: number, end: number): string {
  return String(s).slice(start, end);
}

export function stringCharCodeAt(s: string, index: number): number {
  return String(s).charCodeAt(index);
}

export function stringFromCharCode(code: number): string {
  return String.fromCharCode(code);
}

// Char helpers
//
// IMPORTANT: Tuff `Char` is intended to be backend-agnostic.
// In the JS runtime, we represent a Char as a Unicode scalar value (code point)
// stored in a number (I32 in Tuff terms).
//
// These functions accept indices in UTF-16 code units (JS string indexing), but
// they *return* / *consume* Unicode code points so the language surface isn't
// tied to UTF-16.
//
// - stringCharAt returns the Unicode code point beginning at `index`.
//   If `index` points at an invalid surrogate, it returns U+FFFD.
// - stringCharWidthAt returns how many UTF-16 code units the code point at
//   `index` occupies (0 out-of-range, else 1 or 2).
// - stringFromChar creates a string from a Unicode code point; invalid code
//   points become U+FFFD.

const REPLACEMENT_CHAR = 0xfffd;

function isHighSurrogate(u16: number): boolean {
  return u16 >= 0xd800 && u16 <= 0xdbff;
}

function isLowSurrogate(u16: number): boolean {
  return u16 >= 0xdc00 && u16 <= 0xdfff;
}

function toCodePoint(high: number, low: number): number {
  return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
}

function isValidCodePoint(cp: number): boolean {
  return (
    Number.isFinite(cp) &&
    cp >= 0 &&
    cp <= 0x10ffff &&
    !(cp >= 0xd800 && cp <= 0xdfff)
  );
}

export function stringCharWidthAt(s: string, index: number): number {
  const str = String(s);
  const first = str.charCodeAt(index);
  if (!Number.isFinite(first)) return 0;
  if (isHighSurrogate(first)) {
    const second = str.charCodeAt(index + 1);
    if (Number.isFinite(second) && isLowSurrogate(second)) return 2;
  }
  return 1;
}

export function stringCharAt(s: string, index: number): number {
  const str = String(s);
  const first = str.charCodeAt(index);
  if (!Number.isFinite(first)) return 0;

  if (isHighSurrogate(first)) {
    const second = str.charCodeAt(index + 1);
    if (Number.isFinite(second) && isLowSurrogate(second)) {
      return toCodePoint(first, second);
    }
    return REPLACEMENT_CHAR;
  }

  if (isLowSurrogate(first)) {
    return REPLACEMENT_CHAR;
  }

  return first;
}

export function stringFromChar(ch: number): string {
  const cp = Number(ch);
  if (!isValidCodePoint(cp)) return String.fromCodePoint(REPLACEMENT_CHAR);
  return String.fromCodePoint(cp);
}

// Internal aliases for std::prelude.
// The Tuff `extern from ... use { ... }` syntax does not support renaming, so
// std modules import these internal names and then provide the public surface.
export const __stringCharCodeAt = stringCharCodeAt;
export const __stringFromCharCode = stringFromCharCode;
export const __stringCharAt = stringCharAt;
export const __stringFromChar = stringFromChar;
export const __stringCharWidthAt = stringCharWidthAt;

// ---- Map helpers ----

export type Map_ = Map<unknown, unknown>;

export function map_new(): Map_ {
  return new Map();
}

export function map_get(m: Map_, key: unknown): unknown {
  return m.get(key);
}

export function map_set(m: Map_, key: unknown, value: unknown): void {
  m.set(key, value);
}

export function map_has(m: Map_, key: unknown): boolean {
  return m.has(key);
}

export function map_delete(m: Map_, key: unknown): boolean {
  return m.delete(key);
}

export function map_size(m: Map_): number {
  return m.size;
}

export function map_keys(m: Map_): unknown[] {
  return Array.from(m.keys());
}

export function map_values(m: Map_): unknown[] {
  return Array.from(m.values());
}

// ---- Test runner helpers (Node.js) ----

export function listTestTuffFiles(rootDir: string): string[] {
  const root = resolve(String(rootDir));
  const out: string[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (ent.isFile() && ent.name.endsWith(".test.tuff")) {
        out.push(p);
      }
    }
  }

  walk(root);
  return out;
}

export function listFilesRecursive(rootDir: string): string[] {
  const root = resolve(String(rootDir));
  const out: string[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (ent.isFile()) {
        out.push(p);
      }
    }
  }

  walk(root);
  return out;
}

export function copyFile(srcPath: string, dstPath: string): void {
  const src = resolve(String(srcPath));
  const dst = resolve(String(dstPath));
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

export function runTuffModule(mjsPath: string, argv: string[]): number {
  const abs = resolve(String(mjsPath));
  const url = pathToFileURL(abs).toString();

  const driver = [
    `const mod = await import(${JSON.stringify(url)});`,
    `if (typeof mod.run !== "function") { process.exit(1); }`,
    `const argv = ${JSON.stringify(argv.map(String))};`,
    `const rc = mod.run.length === 0 ? mod.run() : mod.run(argv);`,
    `process.exit(Number(rc) | 0);`,
  ].join("\n");

  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", driver],
    {
      stdio: "inherit",
    }
  );

  if (typeof res.status === "number") return res.status;
  return 1;
}

export function runTuffTestModule(mjsPath: string): number {
  return runTuffModule(mjsPath, []);
}
