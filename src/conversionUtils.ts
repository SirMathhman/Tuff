import { normalizeExpression } from "./compileHelpers";

export function stripNumericTypeSuffixes(input: string): string {
  return input.replace(
    /(-?[0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64|F32|F64)\b/g,
    "$1",
  );
}

export function convertCharLiteralsToUTF8(input: string): string {
  return input.replace(/'(.)'/g, (match, char) => {
    return String(char.charCodeAt(0));
  });
}

export function convertMutableReference(input: string): string {
  // Convert &mut identifier to {value: identifier}
  return input.replace(/&mut\s+([a-zA-Z_][a-zA-Z0-9_]*)/g, "{value: $1}");
}

export function convertPointerDereference(input: string): string {
  // Convert *identifier to identifier.value
  // Match * followed by an identifier (word characters)
  // Use negative lookbehind to avoid matching multiplication operators
  // that come after numbers or identifiers
  return input.replace(
    /(?<![a-zA-Z0-9_])\*([a-zA-Z_][a-zA-Z0-9_]*)/g,
    "$1.value",
  );
}

export function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*?(?=\r\n|\n|$)/g, "");
}

export function convertThisProperty(input: string): string {
  // Convert this.property to just property
  return input.replace(/this\.([a-zA-Z_][a-zA-Z0-9_]*)/g, "$1");
}

export function convertThisTypeVarProperty(
  input: string,
  thisTypeVars: Set<string>,
): string {
  // Convert varName.property to just property when varName is a This-typed variable
  let result = input;
  for (const varName of thisTypeVars) {
    const regex = new RegExp(
      "\\b" + varName + "\\.([a-zA-Z_][a-zA-Z0-9_]*)",
      "g",
    );
    result = result.replace(regex, "$1");
  }
  return result;
}

export function convertArrayLiterals(input: string): string {
  // Convert Tuff array literals [val1, val2, ...] to JavaScript arrays
  // This is a simple passthrough as JavaScript array syntax is the same
  // but we preserve it so it's not treated as a block
  return input;
}

export function normalizeAndStripNumericTypes(input: string): string {
  return convertCharLiteralsToUTF8(
    stripNumericTypeSuffixes(normalizeExpression(input)),
  );
}
