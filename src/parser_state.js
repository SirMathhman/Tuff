// Shared mutable parser state (tokens buffer + position cursor).
let _tokens, _pos;

export default {
  get tokens() {
    return _tokens;
  },
  set tokens(v) {
    _tokens = v;
  },
  get pos() {
    return _pos;
  },
  set pos(v) {
    _pos = v;
  },
};

// Helper: parse brace-enclosed list of identifiers, calling `mapFn` on each.
// Expects cursor at '{', advances past matching '}'.
export function parseBraceIdentList(mapFn) {
  _pos++; // skip '{'
  const fields = [];
  while (_pos < _tokens.length && _tokens[_pos].type !== "brace_close") {
    if (_tokens[_pos].type !== "identifier") {
      throw new Error("Expected identifier in brace pattern");
    }
    fields.push(mapFn(_tokens[_pos++].value));
    // Skip optional comma separator
    if (_pos < _tokens.length && _tokens[_pos].type === "comma") _pos++;
  }
  if (_pos >= _tokens.length || _tokens[_pos].type !== "brace_close") {
    throw new Error("Expected '}' to close brace pattern");
  }
  _pos++; // skip '}'
  return fields;
}
