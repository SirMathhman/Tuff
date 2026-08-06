import type { AstType } from "./types";

// Suffix ranges for numeric types
export const suffixRanges: Record<string, [number, number]> = {
  U8: [0, 255],
  I8: [-128, 127],
  U16: [0, 65535],
  I16: [-32768, 32767],
  U32: [0, 4294967295],
  I32: [-2147483648, 2147483647],
};

export function checkSuffix(suffix: string, value: number): void {
  const range = suffixRanges[suffix];
  if (range && (value < range[0] || value > range[1])) {
    throw new Error(`${suffix} overflow: ${value}`);
  }
}

// Type alias resolution
const typeAliases: Record<string, string> = {};

export function defineTypeAlias(name: string, baseType: string): void {
  typeAliases[name] = baseType;
  detectCycle(name);
}

function detectCycle(name: string): void {
  const seen = new Set<string>();
  let current = name;
  while (typeAliases[current] !== undefined) {
    current = typeAliases[current]!;
    if (seen.has(current)) throw new Error(`circular type alias: ${current}`);
    seen.add(current);
  }
}

export function resolveType(typeName: string): string {
  let current = typeName;
  while (typeAliases[current] !== undefined) {
    current = typeAliases[current]!;
  }
  return current;
}

export function resolveAstType(astType: AstType): AstType {
  if (astType.kind === "primitive") {
    const resolved = resolveType(astType.name);
    return { kind: "primitive", name: resolved };
  }
  if (astType.kind === "array") {
    return {
      kind: "array",
      elementType: resolveAstType(astType.elementType),
      length: astType.length,
    };
  }
  return astType;
}
