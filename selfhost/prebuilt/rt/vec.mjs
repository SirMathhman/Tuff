// Dynamic vector helpers for Tuff bootstrap/runtime (ESM).
//
// Implemented as plain JS arrays for the bootstrap.

export function vec_new() {
  return [];
}

export function vec_len(v) {
  return v.length;
}

export function vec_push(v, item) {
  v.push(item);
}

export function vec_get(v, index) {
  return v[index];
}

export function vec_set(v, index, value) {
  v[index] = value;
}
