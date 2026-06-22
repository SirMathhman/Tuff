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

// Parse yield or return keyword + expression.
// Takes a parseExpr callback to avoid circular dependencies.
// Returns null if current token is not yield/return.
export function parseYieldOrReturn(parseExpr) {
  if (
    _pos >= _tokens.length ||
    _tokens[_pos].type !== "keyword" ||
    (_tokens[_pos].value !== "yield" && _tokens[_pos].value !== "return")
  ) {
    return null;
  }
  const keyword = _tokens[_pos].value;
  _pos++; // skip keyword
  return {
    type: keyword === "yield" ? "yield" : "fn_return",
    value: parseExpr(),
  };
}

// Helper: parse brace-enclosed block of statements/expressions.
// Expects cursor at '{', advances past matching '}'.
// The `parseItem` callback is called for each non-semi token and should return the parsed item (or null to skip).
export function parseBraceBlock(parseItem) {
  _pos++; // skip '{'
  const items = [];
  while (_pos < _tokens.length && _tokens[_pos].type !== "brace_close") {
    if (_tokens[_pos].type === "semi") {
      _pos++;
      continue;
    }
    const item = parseItem();
    if (item !== null) items.push(item);
  }
  if (_pos >= _tokens.length || _tokens[_pos].type !== "brace_close") {
    throw new Error("Expected '}' to close block");
  }
  _pos++; // skip '}'
  return items;
}
// Helper: consume optional generic type parameters <T> or <T, U>, returns array of identifiers.
export function consumeGenericParams() {
  if (_tokens[_pos]?.type === "cmp" && _tokens[_pos]?.value === "<") {
    _pos++; // skip '<'
    const generics = [];
    while (_pos < _tokens.length && _tokens[_pos].type !== "cmp") {
      const tok = _tokens[_pos];
      if (!tok || tok.type !== "identifier") break;
      generics.push(tok.value);
      _pos++;
      // Skip optional ',' between type params
      if (_tokens[_pos]?.type === "comma") _pos++;
    }
    if (_tokens[_pos]?.type === "cmp" && _tokens[_pos]?.value === ">") {
      _pos++; // skip '>'
    } else if (generics.length > 0) {
      throw new Error("Expected '>' to close generic type parameters");
    }
    return generics;
  }
  return [];
}
