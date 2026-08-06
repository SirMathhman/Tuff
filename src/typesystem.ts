import type { AstType, Value } from "./types";
import { toNum } from "./values";

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

// Validate that a value fits a declared type. Throws on mismatch.
// `context` describes the binding site for error messages (e.g. "assign" or "pass").
export function checkValueAgainstType(
  value: Value,
  astType: AstType,
  context: string,
  targetName?: string,
): void {
  const resolved = resolveAstType(astType);
  if (resolved.kind === "array") {
    const innerType = resolveAstType(resolved.elementType);
    if (value.tag !== "array") throw new Error(`expected array, got ${value.tag}`);
    if (value.values.length !== resolved.length)
      throw new Error(`array length mismatch: expected ${resolved.length}, got ${value.values.length}`);
    for (const elem of value.values) {
      if (innerType.kind === "primitive" && suffixRanges[innerType.name] && elem.tag === "number") {
        checkSuffix(innerType.name, elem.num);
      }
    }
    return;
  }
  if (resolved.kind === "primitive" && suffixRanges[resolved.name]) {
    checkSuffix(resolved.name, toNum(value));
    // Check type compatibility using the value's tracked type
    if (value.tag === "number" && value.type && suffixRanges[resolveType(value.type)]) {
      const valRange = suffixRanges[resolveType(value.type)]!;
      const annRange = suffixRanges[resolved.name]!;
      if (valRange[0] < annRange[0] || valRange[1] > annRange[1]) {
        const target = targetName ? ` to ${targetName}` : "";
        throw new Error(`cannot ${context} ${value.type}${target} of type ${resolved.name}`);
      }
    }
  }
}
