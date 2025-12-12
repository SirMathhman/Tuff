// Dynamic vector helpers for Tuff bootstrap/runtime.
//
// This exists because the language will eventually want allocator-backed arrays.
// For now, this is a thin wrapper around JS arrays.

export type Vec = unknown[];

export function vec_new(): Vec {
  return [];
}

export function vec_len(v: Vec): number {
  return v.length;
}

export function vec_push(v: Vec, item: unknown): void {
  v.push(item);
}

export function vec_get(v: Vec, index: number): unknown {
  return v[index];
}

export function vec_set(v: Vec, index: number, value: unknown): void {
  v[index] = value;
}
