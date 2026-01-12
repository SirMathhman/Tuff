import type { Env, StructDef, StructValue } from "./types";
import {
  ensureIdentifier,
  ensureUnique,
  extractPureBracketContent,
  findMatchingParen,
  parseFieldDef,
  parseIdentifierAt,
  sliceTrim,
  splitTopLevelOrEmpty,
  startsWithKeyword,
  topLevelSplitTrim,
  isIntegerTypeName,
  isIdentifierName,
} from "./shared";
import { substituteGenericTypes } from "./signatures";
import { isArrayValue } from "./arrays";
import { isPointerValue } from "./pointers";

// Global registry of struct definitions (name -> StructDef)
const structRegistry = new Map<string, StructDef>();

export function registerStruct(def: StructDef): void {
  structRegistry.set(def.name, def);
}

export function getStructDef(name: string): StructDef | undefined {
  return structRegistry.get(name);
}

export interface StructParseResult {
  def: StructDef;
  nextPos: number; // position in original string after the struct definition
}

export function handleStructStatement(
  stmt: string
): StructParseResult | undefined {
  if (!startsWithKeyword(stmt, "struct")) return undefined;

  let rest = sliceTrim(stmt, 6); // skip "struct"
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid struct declaration");
  const structName = nameRes.name;

  rest = sliceTrim(rest, nameRes.next);

  // optional generics e.g., <A, B>
  let genericParams: string[] | undefined = undefined;
  if (rest.startsWith("<")) {
    const closeGen = rest.indexOf(">");
    if (closeGen === -1) throw new Error("Invalid struct generic list");
    const genContent = rest.slice(1, closeGen).trim();
    genericParams = genContent === "" ? [] : topLevelSplitTrim(genContent, ",");
    rest = sliceTrim(rest, closeGen + 1);
  }

  if (!rest.startsWith("{")) throw new Error("Expected { after struct name");

  const close = findMatchingParen(rest, 0);
  if (close < 0) throw new Error("Unterminated struct");

  const fieldsContent = rest.slice(1, close).trim();
  const fieldDefs = topLevelSplitTrim(fieldsContent, ",");

  const fieldNames: string[] = [];
  const fieldTypes: string[] = [];

  for (const field of fieldDefs) {
    const { name, type } = parseFieldDef(field);
    ensureIdentifier(name, "Invalid field name");
    ensureUnique(name, fieldNames, "Duplicate field name");

    fieldNames.push(name);
    fieldTypes.push(type);
  }

  const def: StructDef = { name: structName, fieldNames, fieldTypes, genericParams };
  registerStruct(def);

  // Calculate how much of the original statement was consumed
  // We've consumed: "struct" (6 chars) + name + optional generics + "{ ... }"
  const openIdx = stmt.indexOf("{");
  const closeBracePos = openIdx + close + 1;

  return { def, nextPos: closeBracePos };
}

export function tryHandleStructLiteral(
  s: string,
  structType: string,
  env: Env | undefined,
  interpret: (input: string, env?: Env) => unknown
): StructValue | undefined {
  // support annotated types like 'Tuple<I32, Bool>' or bare 'Tuple'
  let base = structType;
  let typeArgs: string[] | undefined = undefined;
  const lt = structType.indexOf("<");
  if (lt !== -1) {
    const gt = structType.indexOf(">", lt + 1);
    if (gt === -1) return undefined;
    base = structType.slice(0, lt).trim();
    const inner = structType.slice(lt + 1, gt).trim();
    typeArgs = inner === "" ? [] : topLevelSplitTrim(inner, ",");
  }

  const def = getStructDef(base);
  if (!def) return undefined;

  if (!s.startsWith("{")) return undefined;
  const content = extractPureBracketContent(s, 0);
  if (content === undefined) return undefined;

  const values = splitTopLevelOrEmpty(content, ",");

  if (values.length !== def.fieldNames.length) {
    throw new Error(
      `Struct ${structType} expects ${def.fieldNames.length} fields, got ${values.length}`
    );
  }

  // Resolve & substitute generic params
  const resolvedFieldTypes = resolveStructFieldTypes(def, typeArgs);
  const fieldValues: unknown[] = values.map((v) =>
    evalStructFieldInitializer(v, env, interpret)
  );

  // Validate each field value against resolved type
  for (let i = 0; i < fieldValues.length; i++) {
    validateFieldValue(resolvedFieldTypes[i], fieldValues[i]);
  }

  return {
    fields: def.fieldNames,
    values: fieldValues,
  } as StructValue;
}

function evalStructFieldInitializer(
  expr: string,
  env: Env | undefined,
  interpret: (input: string, env?: Env) => unknown
): unknown {
  const t = expr.trim();
  if (env && isIdentifierName(t) && env.has(t)) {
    const item = env.get(t)!;
    if (item.type === "__deleted__") throw new Error("Unknown identifier");
    if (item.moved) throw new Error("Use-after-move");

    // Important: do NOT perform linear move semantics here.
    // Struct field initialization behaves like a read for linear numbers.
    if (typeof item.value === "number") return item.value;
    return item.value;
  }
  return interpret(expr, env);
}

export function getStructFieldValue(
  structValue: StructValue,
  fieldName: string
): unknown | undefined {
  const idx = structValue.fields.indexOf(fieldName);
  if (idx === -1) return undefined;
  return structValue.values[idx];
}

export function isStructValue(v: unknown): v is StructValue {
  return (
    typeof v === "object" &&
    v !== null &&
    "fields" in v &&
    "values" in v &&
    Array.isArray((v as StructValue).fields) &&
    Array.isArray((v as StructValue).values)
  );
}

function resolveStructFieldTypes(def: StructDef, typeArgs: string[] | undefined): string[] {
  const fieldTypes = def.fieldTypes.slice();
  if (def.genericParams && def.genericParams.length > 0) {
    if (!typeArgs || typeArgs.length !== def.genericParams.length)
      throw new Error("Invalid type parameters for struct");
    const map = new Map<string, string>();
    for (let i = 0; i < def.genericParams.length; i++) map.set(def.genericParams[i], typeArgs![i]);
    return fieldTypes.map((ft) => substituteGenericTypes(ft, map));
  }
  return fieldTypes;
}

function validateFieldValue(expectedType: string, value: unknown) {
  const t = expectedType.trim();
  if (t.startsWith("*") || t.startsWith("[")) {
    const ok = t.startsWith("*") ? isPointerValue(value) : isArrayValue(value);
    if (!ok)
      throw new Error(t.startsWith("*") ? "Pointer type mismatch" : "Type mismatch");
    return;
  }
  if (t === "Bool" || isIntegerTypeName(t) || t === "Number") {
    if (typeof value !== "number") throw new Error("Type mismatch");
    if (!Number.isFinite(value)) throw new Error("Type mismatch");
    return;
  }
  const nested = getStructDef(t);
  if (nested) {
    if (!isStructValue(value)) throw new Error("Type mismatch");
    return;
  }
  // otherwise accept
}
