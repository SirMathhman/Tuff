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
