// Type annotation parsing helpers for Tuff compiler.
import state from "./parser_state";

// Parse a single type component (with optional leading '*' for pointer).
// Returns the uppercase type string, e.g. "I32" or "*I32".
export function parseTypeComponent() {
  let isPointer = false;

  // Optional leading '*' for pointer types (*T)
  const tok0 = state.tokens[state.pos];
  if (tok0?.type === "ref" || (tok0?.type === "op" && tok0.value === "*")) {
    isPointer = true;
    state.pos++;
  }

  // Object/struct type annotation: { field : Type, ... }
  const tok1 = state.tokens[state.pos];
  if (tok1?.type === "brace_open") {
    state.pos++; // skip '{'
    parseStructFields(); // consume and discard fields for inline annotations
    return isPointer ? `*STRUCT` : "STRUCT";
  }

  const tok = state.tokens[state.pos];
  if (!tok || (tok.type !== "identifier" && tok.type !== "null"))
    throw new Error("Expected type name after ':' or '*'");
  let typeName = (tok.value ?? "null").toUpperCase();
  state.pos++;

  // Optional type arguments: Wrapper<I32> → consume <I32>
  if (
    state.tokens[state.pos]?.type === "cmp" &&
    state.tokens[state.pos]?.value === "<"
  ) {
    state.pos++; // skip '<'
    const args = [];
    while (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type !== "cmp"
    ) {
      const argTok = state.tokens[state.pos];
      if (!argTok || argTok.type !== "identifier") break;
      args.push(argTok.value.toUpperCase());
      state.pos++;
      if (state.tokens[state.pos]?.type === "comma") state.pos++;
    }
    if (
      state.tokens[state.pos]?.type === "cmp" &&
      state.tokens[state.pos]?.value === ">"
    ) {
      state.pos++; // skip '>'
    } else if (args.length > 0) {
      throw new Error("Expected '>' to close type arguments");
    }
    typeName = `${typeName}<${args.join(",")}>`;
  }

  return isPointer ? `*${typeName}` : typeName;
}

// Parse struct fields from '{' to matching '}', returning the parsed fields array.
// Each field is { name: string, type: string }.
export function parseStructFields() {
  const fields = [];
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type !== "brace_close"
  ) {
    if (state.tokens[state.pos]?.type !== "identifier")
      throw new Error("Expected field name in struct type");
    const fieldName = state.tokens[state.pos++].value;
    if (state.tokens[state.pos]?.type !== "colon")
      throw new Error("Expected ':' after field name in struct type");
    state.pos++; // skip ':'
    fields.push({ name: fieldName, type: parseTypeComponent() });
  }
  if (state.tokens[state.pos]?.type !== "brace_close")
    throw new Error("Expected '}' to close struct type");
  state.pos++; // skip '}'
  return fields;
}

// Parse optional type annotation: ':' followed by a type identifier or 'null', optionally joined with '|' for unions.
// Returns null if no annotation present, otherwise an array of uppercase type strings (single-element for non-unions).
export function parseTypeAnnotation() {
  let typeName = null;
  if (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "colon"
  ) {
    state.pos++; // skip ':'

    const types = [];

    // First type component (may have leading '*')
    types.push(parseTypeComponent());

    // Additional union members separated by '|'
    while (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "pipe"
    ) {
      state.pos++; // skip '|'
      types.push(parseTypeComponent());
    }

    // Return single string for non-union, array for union
    typeName = types.length === 1 ? types[0] : types;
  }
  return typeName;
}
