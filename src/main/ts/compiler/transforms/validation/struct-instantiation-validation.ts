import { getCompileStructDefs } from "../../storage/struct-defs-storage";
import { getConcreteType } from "../../../utils/generics/generic-validation";
import { isTypeCompatible } from "../type-compatibility";
import { throwFieldTypeMismatch } from "../error-helpers";
import { parseFieldAssignments } from "../../parsing/field-parsing";

/**
 * Replace generic type parameters with concrete types
 * e.g., {"T" -> "Bool"}, "T" -> "Bool"
 */
function resolveTypeParameter(
  typeStr: string,
  typeMapping: Map<string, string>,
): string {
  return typeMapping.get(typeStr) || typeStr;
}

/**
 * Skip whitespace characters in source string
 */
function skipWhitespace(source: string, start: number): number {
  let i = start;
  while (
    i < source.length &&
    (source[i] === " " || source[i] === "\t" || source[i] === "\n")
  )
    i++;
  return i;
}

/**
 * Extract generic type parameters from struct instantiation
 * Returns the generic types string and the index after the closing >
 */
function extractGenericTypes(
  source: string,
  start: number,
): { genericTypesStr: string; endIndex: number } {
  if (start >= source.length || source[start] !== "<") {
    return { genericTypesStr: "", endIndex: start };
  }

  const genericStart = start + 1;
  let depth = 1;
  let i = start + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "<") depth++;
    else if (source[i] === ">") depth--;
    i++;
  }

  return {
    genericTypesStr: source.slice(genericStart, i - 1),
    endIndex: i,
  };
}

/**
 * Extract fields from struct instantiation braces
 * Returns the fields string and the index after the closing }
 */
function extractFields(
  source: string,
  start: number,
): { fieldsStr: string; endIndex: number } {
  if (start >= source.length || source[start] !== "{") {
    return { fieldsStr: "", endIndex: start };
  }

  const fieldsStart = start + 1;
  let braceDepth = 1;
  let i = start + 1;
  while (i < source.length && braceDepth > 0) {
    if (source[i] === "{") braceDepth++;
    else if (source[i] === "}") braceDepth--;
    i++;
  }

  return {
    fieldsStr: source.slice(fieldsStart, i - 1),
    endIndex: i,
  };
}

interface StructDef {
  fields: Map<string, string>;
  generics?: string[];
}

/**
 * Build type parameter mapping from generics
 */
function buildTypeMapping(
  structGenerics: string[] | undefined,
  concreteTypes: string[],
): Map<string, string> {
  const typeMapping = new Map<string, string>();
  if (structGenerics && concreteTypes.length > 0) {
    for (
      let j = 0;
      j < Math.min(structGenerics.length, concreteTypes.length);
      j++
    ) {
      typeMapping.set(structGenerics[j]!, concreteTypes[j]!);
    }
  }
  return typeMapping;
}

/**
 * Validate field assignments against struct definition
 */
function validateFields(
  fieldAssignments: Array<[string, string]>,
  structDef: StructDef,
  typeMapping: Map<string, string>,
): void {
  for (const [fieldName, fieldValue] of fieldAssignments) {
    const fieldTypeStr = structDef.fields.get(fieldName);
    if (!fieldTypeStr) continue; // Field doesn't exist

    // Only validate if the field type looks like a type (not a value literal)
    const firstChar = fieldTypeStr[0];
    const isValidType =
      firstChar !== undefined && firstChar >= "A" && firstChar <= "Z";
    if (!isValidType) continue; // Skip non-type definitions

    // Resolve generic type parameters in field type
    const resolvedType = resolveTypeParameter(fieldTypeStr, typeMapping);

    // Skip validation if we can't determine type
    const inferred = getConcreteType(fieldValue);
    if (!inferred) continue;

    // Check compatibility
    if (!isTypeCompatible(fieldValue, resolvedType)) {
      throwFieldTypeMismatch(fieldName, resolvedType, fieldValue);
    }
  }
}

/**
 * Validate struct instantiation fields against their types
 */
export function validateStructInstantiation(source: string): void {
  const structDefs = getCompileStructDefs();
  if (structDefs.size === 0) {
    return; // No structs defined
  }

  // Find all struct instantiations in the source
  for (const [structName, structDef] of structDefs.entries()) {
    let searchStart = 0;
    while (true) {
      const structIndex = source.indexOf(structName, searchStart);
      if (structIndex === -1) break;

      searchStart = structIndex + structName.length;
      let i = skipWhitespace(source, searchStart);

      // Extract generic type parameters
      const { genericTypesStr, endIndex: afterGenerics } = extractGenericTypes(
        source,
        i,
      );
      i = skipWhitespace(source, afterGenerics);

      // Must have opening brace for struct instantiation
      if (i >= source.length || source[i] !== "{") continue;

      // Extract fields from braces
      const { fieldsStr } = extractFields(source, i);

      // Parse concrete types
      const concreteTypes = genericTypesStr
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Build type parameter mapping
      const typeMapping = buildTypeMapping(structDef.generics, concreteTypes);

      // Parse and validate field assignments
      const fieldAssignments = parseFieldAssignments(fieldsStr);
      validateFields(fieldAssignments, structDef, typeMapping);
    }
  }
}
