import type { AstType, Value } from "./types";

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

// Build a type-param -> type-arg substitution map (for generic structs and fns).
// `aliases` is used to resolve type args canonically.
export function typeSubstitution(
  typeParams: string[] | undefined,
  typeArgs: AstType[] | undefined,
  aliases: Map<string, string>,
): Map<string, AstType> {
  const subst = new Map<string, AstType>();
  if (typeParams && typeArgs) {
    typeParams.forEach((tp, i) => {
      const arg = typeArgs[i];
      if (arg) subst.set(tp, resolveAliasedType(aliases, arg));
    });
  }
  return subst;
}

// Replace type params with their substituted types throughout an AstType.
export function substituteAstType(t: AstType, subst: Map<string, AstType>): AstType {
  if (t.kind === "primitive") {
    const replacement = subst.get(t.name);
    return replacement ?? t;
  }
  if (t.kind === "array")
    return { kind: "array", elementType: substituteAstType(t.elementType, subst), length: t.length };
  if (t.kind === "slice") return { kind: "slice", elementType: substituteAstType(t.elementType, subst) };
  if (t.kind === "struct")
    return { kind: "struct", fields: t.fields.map((f) => ({ name: f.name, type: substituteAstType(f.type, subst) })) };
  if (t.kind === "union")
    return { kind: "union", types: t.types.map((m) => substituteAstType(m, subst)) };
  if (t.kind === "ref") return { kind: "ref", targetType: substituteAstType(t.targetType, subst) };
  if (t.kind === "tuple") return { kind: "tuple", elements: t.elements.map((e) => substituteAstType(e, subst)) };
  if (t.kind === "fn")
    return { kind: "fn", params: t.params.map((p) => substituteAstType(p, subst)), returnType: substituteAstType(t.returnType, subst) };
  return t;
}

// Resolve a type's alias references without needing a TypeEnv.
function resolveAliasedType(aliases: Map<string, string>, t: AstType): AstType {
  if (t.kind === "primitive") {
    let name = t.name;
    while (aliases.has(name)) name = aliases.get(name)!;
    return { kind: "primitive", name };
  }
  if (t.kind === "array")
    return { kind: "array", elementType: resolveAliasedType(aliases, t.elementType), length: t.length };
  if (t.kind === "slice") return { kind: "slice", elementType: resolveAliasedType(aliases, t.elementType) };
  if (t.kind === "struct")
    return { kind: "struct", fields: t.fields.map((f) => ({ name: f.name, type: resolveAliasedType(aliases, f.type) })) };
  if (t.kind === "union")
    return { kind: "union", types: t.types.map((m) => resolveAliasedType(aliases, m)) };
  if (t.kind === "ref") return { kind: "ref", targetType: resolveAliasedType(aliases, t.targetType) };
  if (t.kind === "tuple") return { kind: "tuple", elements: t.elements.map((e) => resolveAliasedType(aliases, e)) };
  if (t.kind === "fn")
    return { kind: "fn", params: t.params.map((p) => resolveAliasedType(aliases, p)), returnType: resolveAliasedType(aliases, t.returnType) };
  return t;
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
  if (astType.kind === "slice") {
    return {
      kind: "slice",
      elementType: resolveAstType(astType.elementType),
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
  if (astType.kind === "ref") {
    return { kind: "ref", targetType: resolveAstType(astType.targetType) };
  }
  if (astType.kind === "tuple") {
    return { kind: "tuple", elements: astType.elements.map((e) => resolveAstType(e)) };
  }
  if (astType.kind === "fn") {
    return {
      kind: "fn",
      params: astType.params.map((p) => resolveAstType(p)),
      returnType: resolveAstType(astType.returnType),
    };
  }
  return astType;
}

// Mode for value-vs-type matching.
// "strict" — exact type equality (`is` operator, valueMatchesType).
// "assign" — range-based compatibility (let annotations, function params).
type MatchMode = "strict" | "assign";

// Dereference a value for type checking (non-ref values pass through).
function derefValue(value: Value): Value {
  if (value.tag === "ref") return value.scope.vars[value.name]!;
  return value;
}

// Check whether a value matches a type (used by the `is` operator).
export function valueMatchesType(value: Value, astType: AstType): boolean {
  return matchValue(value, resolveAstType(astType), "strict").ok;
}

// Validate that a value fits a declared type. Throws on mismatch.
// `context` describes the binding site for error messages (e.g. "assign" or "pass").
export function checkValueAgainstType(
  value: Value,
  astType: AstType,
  context: string,
  targetName?: string,
): void {
  const result = matchValue(value, resolveAstType(astType), "assign", context, targetName);
  if (!result.ok) throw new Error(result.error!);
}

// Single value-vs-type walker shared by `is` (strict) and annotations (assign).
// Returns ok + a human-readable error for the assign mode.
function matchValue(
  value: Value,
  resolved: AstType,
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  switch (resolved.kind) {
    case "primitive":
      return matchPrimitive(value, resolved, mode, context, targetName);
    case "array":
      return matchArray(value, resolved, mode, context, targetName);
    case "slice":
      return matchSlice(value, resolved, mode, context, targetName);
    case "struct":
      return matchStruct(value, resolved, mode, context);
    case "union": {
      // A value is valid if it matches at least one member of the union.
      for (const member of resolved.types) {
        if (matchValue(value, member, mode, context, targetName).ok) {
          return { ok: true };
        }
      }
      return fail(context, targetName, "of union type");
    }
    case "ref": {
      if (value.tag === "ref") {
        return matchValue(derefValue(value), resolved.targetType, mode, context, targetName);
      }
      // Assign mode auto-references: &T accepts a value of type T directly.
      if (mode === "assign") {
        return matchValue(value, resolved.targetType, mode, context, targetName);
      }
      return fail(context, targetName, `expected reference, got ${value.tag}`);
    }
    case "tuple":
      return matchTuple(value, resolved, mode, context, targetName);
    case "fn":
      return matchFn(value, resolved, mode, context, targetName);
  }
}

// Match each value against its corresponding type, in order.
function matchElements(
  values: Value[],
  types: AstType[],
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  for (let i = 0; i < types.length; i++) {
    const r = matchValue(values[i]!, types[i]!, mode, context, targetName);
    if (!r.ok) return r;
  }
  return { ok: true };
}

function matchTuple(
  value: Value,
  resolved: Extract<AstType, { kind: "tuple" }>,
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  if (value.tag !== "tuple")
    return fail(context, targetName, `expected tuple, got ${value.tag}`);
  if (value.values.length !== resolved.elements.length)
    return fail(context, targetName, `tuple length mismatch: expected ${resolved.elements.length}, got ${value.values.length}`);
  return matchElements(value.values, resolved.elements, mode, context, targetName);
}

function fail(
  context: string | undefined,
  targetName: string | undefined,
  message: string,
): { ok: false; error: string } {
  if (context === undefined) return { ok: false, error: message };
  const target = targetName ? ` to ${targetName}` : "";
  return { ok: false, error: `cannot ${context} value${target} ${message}` };
}

function matchFn(
  value: Value,
  resolved: Extract<AstType, { kind: "fn" }>,
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  const v = derefValue(value);
  if (v.tag !== "fn")
    return fail(context, targetName, `expected fn, got ${v.tag}`);
  if (v.params.length !== resolved.params.length)
    return fail(context, targetName, `fn param count mismatch: expected ${resolved.params.length}, got ${v.params.length}`);
  return { ok: true };
}

function matchPrimitive(
  value: Value,
  resolved: Extract<AstType, { kind: "primitive" }>,
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  // Suffixed numeric type: U8, I32, ...
  if (suffixRanges[resolved.name]) {
    if (value.tag !== "number" && value.tag !== "ref") {
      return fail(context, targetName, `expected ${resolved.name}, got ${value.tag}`);
    }
    const num = derefValue(value);
    if (num.tag !== "number") {
      return fail(context, targetName, `expected ${resolved.name}, got ${num.tag}`);
    }
    const numVal = num.num;
    if (numVal < suffixRanges[resolved.name]![0] || numVal > suffixRanges[resolved.name]![1]) {
      return fail(context, targetName, `${resolved.name} overflow: ${numVal}`);
    }
    if (mode === "assign") {
      // Range-based compatibility: allow widening (U16 -> U8 fits), block narrowing (U8 -> U16).
      if (num.type && suffixRanges[resolveType(num.type)]) {
        const valRange = suffixRanges[resolveType(num.type)]!;
        const annRange = suffixRanges[resolved.name]!;
        if (valRange[0] < annRange[0] || valRange[1] > annRange[1]) {
          return fail(context, targetName, `${num.type} of type ${resolved.name}`);
        }
      }
      return { ok: true };
    }
    // Strict: exact type equality — untyped numbers never match a suffixed type.
    if (num.type) {
      return { ok: resolveType(num.type) === resolved.name, error: `${num.type} of type ${resolved.name}` };
    }
    return { ok: false, error: `expected ${resolved.name}, got number` };
  }
  // Non-suffixed primitive: bool, string, tuple, array, record, null, fn, ref, enum, number.
  if (mode === "assign") {
    // Annotations only range-check suffixed numerics; anything else passes.
    return { ok: true };
  }
  const typeName = resolved.name.toLowerCase();
  const tagMap: Record<string, string> = {
    bool: "bool",
    string: "string",
    tuple: "tuple",
    array: "array",
    record: "record",
    null: "null",
    fn: "fn",
    ref: "ref",
    enum: "enum",
  };
  if (value.tag === "number" && value.type) {
    return { ok: resolveType(value.type) === resolved.name };
  }
  // Named struct type: the value must be a struct with a matching typeName.
  if (isStructType(resolved.name)) {
    return { ok: value.tag === "struct" && value.typeName === resolved.name };
  }
  const tagName = tagMap[typeName];
  if (tagName) return { ok: value.tag === tagName };
  return { ok: value.tag === "number" && !value.type && resolved.name === "number" };
}

function matchArray(
  value: Value,
  resolved: Extract<AstType, { kind: "array" }>,
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  if (value.tag !== "array")
    return fail(context, targetName, `expected array, got ${value.tag}`);
  if (value.values.length !== resolved.length)
    return fail(context, targetName, `array length mismatch: expected ${resolved.length}, got ${value.values.length}`);
  return matchElements(
    value.values,
    Array.from({ length: resolved.length }, () => resolved.elementType),
    mode,
    context,
    targetName,
  );
}

function matchSlice(
  value: Value,
  resolved: Extract<AstType, { kind: "slice" }>,
  mode: MatchMode,
  context?: string,
  targetName?: string,
): { ok: boolean; error?: string } {
  if (value.tag !== "array")
    return fail(context, targetName, `expected array, got ${value.tag}`);
  return matchElements(
    value.values,
    value.values.map(() => resolved.elementType),
    mode,
    context,
    targetName,
  );
}

function matchStruct(
  value: Value,
  resolved: Extract<AstType, { kind: "struct" }>,
  mode: MatchMode,
  context?: string,
): { ok: boolean; error?: string } {
  if (value.tag !== "record")
    return fail(context, undefined, `expected struct, got ${value.tag}`);
  for (const field of resolved.fields) {
    const fieldVal = value.fields[field.name];
    if (fieldVal === undefined)
      return fail(context, undefined, `missing field ${field.name}`);
    const r = matchValue(fieldVal, field.type, mode, context, field.name);
    if (!r.ok) return r;
  }
  return { ok: true };
}
