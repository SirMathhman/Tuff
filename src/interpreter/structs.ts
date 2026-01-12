import type { Env, StructDef, StructValue } from "./types";
import {
  ensureIdentifier,
  ensureUnique,
  extractPureBracketContent,
  findMatchingParen,
  interpretAll,
  parseFieldDef,
  parseIdentifierAt,
  sliceTrim,
  splitTopLevelOrEmpty,
  startsWithKeyword,
  topLevelSplitTrim,
} from "./shared";

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

  const def: StructDef = { name: structName, fieldNames, fieldTypes };
  registerStruct(def);

  // Calculate how much of the original statement was consumed
  // We've consumed: "struct" (6 chars) + name + "{ ... }"
  // But we need to account for trimming, so let's find where the closing } is in the original
  const closeBracePos = stmt.indexOf("{") + close + 1;

  return { def, nextPos: closeBracePos };
}

export function tryHandleStructLiteral(
  s: string,
  structType: string,
  env: Env | undefined,
  interpret: (input: string, env?: Env) => unknown
): StructValue | undefined {
  const def = getStructDef(structType);
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

  const fieldValues = interpretAll(values, interpret, env);

  return {
    fields: def.fieldNames,
    values: fieldValues,
  } as StructValue;
}

export function getStructFieldValue(
  structValue: StructValue,
  fieldName: string
): number | undefined {
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
