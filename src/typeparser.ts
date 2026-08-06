import type { AstType, Token } from "./types";

// Type parser — parses type annotations into AstType, does not evaluate.
// Advances the shared position so callers can continue parsing the expression.
export function parseType(tokens: Token[], pos: { pos: number }): AstType {
  if (tokens[pos.pos]?.value === "[") {
    pos.pos++; // skip "["
    const elementType = parseType(tokens, pos);
    pos.pos++; // skip ";"
    const length = parseInt(tokens[pos.pos]!.value);
    pos.pos++; // skip length
    pos.pos++; // skip "]"
    return { kind: "array", elementType, length };
  }
  if (tokens[pos.pos]?.value === "{") {
    // Anonymous struct type: { x : I32, y : I32 }
    pos.pos++; // skip "{"
    const fields: { name: string; type: AstType }[] = [];
    while (tokens[pos.pos]?.value !== "}") {
      const name = tokens[pos.pos]!.value;
      pos.pos++; // skip field name
      pos.pos++; // skip ":"
      const type = parseType(tokens, pos);
      fields.push({ name, type });
      if (tokens[pos.pos]?.value === ",") pos.pos++;
    }
    pos.pos++; // skip "}"
    return { kind: "struct", fields };
  }
  const name = tokens[pos.pos]!.value;
  pos.pos++; // skip type name
  return { kind: "primitive", name };
}
