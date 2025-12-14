// Tuff runtime stdlib (ESM)
//
// Keep this file dependency-free (other than Node builtins) so emitted `.mjs`
// from the bootstrap compiler can import it.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";

export function print(s) {
  process.stdout.write(String(s));
}

export function println(s) {
  process.stdout.write(String(s) + "\n");
}

export function panic(message) {
  throw new Error(String(message));
}

export function readTextFile(path) {
  return readFileSync(path, "utf8");
}

export function writeTextFile(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, "utf8");
}

export function mkdirp(path) {
  mkdirSync(path, { recursive: true });
}

export function pathDirname(path) {
  return dirname(path);
}

export function pathBasename(path) {
  return basename(path);
}

export function pathJoin(a, b) {
  return join(a, b);
}

export function pathResolve(path) {
  return resolve(path);
}

export function cwd() {
  return process.cwd();
}

export function args() {
  return process.argv.slice(2);
}

export function exit(code) {
  process.exit(code);
}

// ---- String helpers (bootstrap) ----

export function stringLen(s) {
  return String(s).length;
}

export function stringSlice(s, start, end) {
  return String(s).slice(start, end);
}

export function stringCharCodeAt(s, index) {
  return String(s).charCodeAt(index);
}

export function stringFromCharCode(code) {
  return String.fromCharCode(code);
}

// Char helpers
//
// NOTE: In the current bootstrap, Tuff `Char` behaves like a numeric code unit.
// These helpers intentionally operate on UTF-16 code units (JS semantics).
export function stringCharAt(s, index) {
  const n = String(s).charCodeAt(index);
  // JS returns NaN for out-of-range indices. Map that to 0 for stability.
  if (!Number.isFinite(n)) return 0;
  return n & 0xffff;
}

export function stringFromChar(ch) {
  return String.fromCharCode(Number(ch) & 0xffff);
}

// Internal aliases for std::prelude (see rt/stdlib.ts).
export const __stringCharCodeAt = stringCharCodeAt;
export const __stringFromCharCode = stringFromCharCode;
export const __stringCharAt = stringCharAt;
export const __stringFromChar = stringFromChar;

// ---- Map helpers ----

export function map_new() {
  return new Map();
}

export function map_get(m, key) {
  return m.get(key);
}

export function map_set(m, key, value) {
  m.set(key, value);
}

export function map_has(m, key) {
  return m.has(key);
}

export function map_delete(m, key) {
  return m.delete(key);
}

export function map_size(m) {
  return m.size;
}

export function map_keys(m) {
  return Array.from(m.keys());
}

export function map_values(m) {
  return Array.from(m.values());
}
