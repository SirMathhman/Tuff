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
// IMPORTANT: Tuff `Char` is intended to be backend-agnostic.
// In the JS runtime, we represent a Char as a Unicode scalar value (code point)
// stored in a number.
//
// These functions accept indices in UTF-16 code units (JS string indexing), but
// they *return* / *consume* Unicode code points so the language surface isn't
// tied to UTF-16.

const REPLACEMENT_CHAR = 0xfffd;

function isHighSurrogate(u16) {
  return u16 >= 0xd800 && u16 <= 0xdbff;
}

function isLowSurrogate(u16) {
  return u16 >= 0xdc00 && u16 <= 0xdfff;
}

function toCodePoint(high, low) {
  return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
}

function isValidCodePoint(cp) {
  return (
    Number.isFinite(cp) &&
    cp >= 0 &&
    cp <= 0x10ffff &&
    !(cp >= 0xd800 && cp <= 0xdfff)
  );
}

export function stringCharWidthAt(s, index) {
  const str = String(s);
  const first = str.charCodeAt(index);
  if (!Number.isFinite(first)) return 0;
  if (isHighSurrogate(first)) {
    const second = str.charCodeAt(index + 1);
    if (Number.isFinite(second) && isLowSurrogate(second)) return 2;
  }
  return 1;
}

export function stringCharAt(s, index) {
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

export function stringFromChar(ch) {
  const cp = Number(ch);
  if (!isValidCodePoint(cp)) return String.fromCodePoint(REPLACEMENT_CHAR);
  return String.fromCodePoint(cp);
}

// Internal aliases for std::prelude (see rt/stdlib.ts).
export const __stringCharCodeAt = stringCharCodeAt;
export const __stringFromCharCode = stringFromCharCode;
export const __stringCharAt = stringCharAt;
export const __stringFromChar = stringFromChar;
export const __stringCharWidthAt = stringCharWidthAt;

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
