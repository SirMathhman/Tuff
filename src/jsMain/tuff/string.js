// JavaScript implementation of Tuff string operations

function string_length(s) {
  return s.length;
}

function string_charAt(s, index) {
  return s.charCodeAt(index);
}

function string_substring(s, start, end) {
  return s.substring(start, end);
}

function string_indexOf(s, needle) {
  return s.indexOf(needle);
}

function string_equals(s1, s2) {
  return s1 === s2;
}

function string_concat(s1, s2) {
  return s1 + s2;
}

function string_fromI32(value) {
  return String(value);
}

function string_toI32(s) {
  return parseInt(s, 10);
}

function string_destroy(s) {
  // JavaScript has garbage collection, no explicit cleanup needed
}
