// Tuff runtime stdlib (TypeScript source)
//
// This is intentionally tiny: just enough for a self-hosted compiler.
// The bootstrap compiler can import this via:
//   extern from rt::stdlib use { ... }

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";

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
// NOTE: In the current bootstrap, Tuff `Char` behaves like a numeric code unit.
// These helpers intentionally operate on UTF-16 code units (JS semantics):
// - stringCharAt returns the code unit at `index` (0..65535)
// - stringFromChar creates a 1-code-unit string from that code unit
export function stringCharAt(s: string, index: number): number {
  const n = String(s).charCodeAt(index);
  // JS returns NaN for out-of-range indices. Map that to 0 for stability.
  if (!Number.isFinite(n)) return 0;
  return n & 0xffff;
}

export function stringFromChar(ch: number): string {
  // Mask to a single UTF-16 code unit.
  return String.fromCharCode(Number(ch) & 0xffff);
}

// Internal aliases for std::prelude.
// The Tuff `extern from ... use { ... }` syntax does not support renaming, so
// std modules import these internal names and then provide the public surface.
export const __stringCharCodeAt = stringCharCodeAt;
export const __stringFromCharCode = stringFromCharCode;
export const __stringCharAt = stringCharAt;
export const __stringFromChar = stringFromChar;

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
