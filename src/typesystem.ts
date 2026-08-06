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

// Struct definitions: name -> field definitions
const structDefs: Record<string, { name: string; type: AstType }[]> = {};

export function defineStruct(name: string, fields: { name: string; type: AstType }[]): void {
  structDefs[name] = fields;
}

export function getStructFields(name: string): { name: string; type: AstType }[] | undefined {
  return structDefs[name];
}

export function isStructType(name: string): boolean {
  return structDefs[name] !== undefined;
}

// Enum definitions: name -> variant names
const enumDefs: Record<string, string[]> = {};

export function defineEnum(name: string, variants: string[]): void {
  enumDefs[name] = variants;
}

export function getEnumVariants(name: string): string[] | undefined {
  return enumDefs[name];
}

export function isEnumType(name: string): boolean {
  return enumDefs[name] !== undefined;
}

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
  if (astType.kind === "struct") {
    return {
      kind: "struct",
      fields: astType.fields.map((f) => ({ name: f.name, type: resolveAstType(f.type) })),
    };
  }
  if (astType.kind === "union") {
    return {
      kind: "union",
      types: astType.types.map((t) => resolveAstType(t)),
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
  switch (resolved.kind) {
    case "struct":
      checkStruct(value, resolved, context);
      return;
    case "array":
      checkArray(value, resolved);
      return;
    case "primitive":
      checkPrimitive(value, resolved, context, targetName);
      return;
    case "union":
      checkUnion(value, resolved, context, targetName);
      return;
  }
}

function checkUnion(
  value: Value,
  resolved: Extract<AstType, { kind: "union" }>,
  context: string,
  targetName?: string,
): void {
  // A value is valid if it matches at least one member of the union.
  let matched = false;
  for (const member of resolved.types) {
    try {
      checkValueAgainstType(value, member, context, targetName);
      matched = true;
      break;
    } catch {
      // try next member
    }
  }
  if (!matched) {
    const target = targetName ? ` to ${targetName}` : "";
    throw new Error(`cannot ${context} value${target} of union type`);
  }
}

function checkStruct(
  value: Value,
  resolved: Extract<AstType, { kind: "struct" }>,
  context: string,
): void {
  if (value.tag !== "record")
    throw new Error(`expected struct, got ${value.tag}`);
  for (const field of resolved.fields) {
    const fieldVal = value.fields[field.name];
    if (fieldVal === undefined)
      throw new Error(`missing field ${field.name}`);
    checkValueAgainstType(fieldVal, field.type, context, field.name);
  }
}

function checkArray(
  value: Value,
  resolved: Extract<AstType, { kind: "array" }>,
): void {
  const innerType = resolveAstType(resolved.elementType);
  if (value.tag !== "array") throw new Error(`expected array, got ${value.tag}`);
  if (value.values.length !== resolved.length)
    throw new Error(`array length mismatch: expected ${resolved.length}, got ${value.values.length}`);
  for (const elem of value.values) {
    if (innerType.kind === "primitive" && suffixRanges[innerType.name] && elem.tag === "number") {
      checkSuffix(innerType.name, elem.num);
    }
  }
}

function checkPrimitive(
  value: Value,
  resolved: Extract<AstType, { kind: "primitive" }>,
  context: string,
  targetName?: string,
): void {
  if (!suffixRanges[resolved.name]) return;
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
