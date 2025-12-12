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
