// JavaScript implementation of Tuff string operations

export function string_length(s) {
  return s.length;
}

export function string_charAt(s, index) {
  return s.charCodeAt(index);
}

export function string_substring(s, start, end) {
  return s.substring(start, end);
}

export function string_indexOf(s, needle) {
  return s.indexOf(needle);
}

export function string_equals(s1, s2) {
  return s1 === s2;
}

export function string_concat(s1, s2) {
  return s1 + s2;
}

export function string_fromI32(value) {
  return String(value);
}

export function string_toI32(s) {
  return parseInt(s, 10);
}

export function string_destroy(s) {
  // JavaScript has garbage collection, no explicit cleanup needed
}

// Make functions globally available for compiled Tuff code
globalThis.string_length = string_length;
globalThis.string_charAt = string_charAt;
globalThis.string_substring = string_substring;
globalThis.string_indexOf = string_indexOf;
globalThis.string_equals = string_equals;
globalThis.string_concat = string_concat;
globalThis.string_fromI32 = string_fromI32;
globalThis.string_toI32 = string_toI32;
globalThis.string_destroy = string_destroy;
