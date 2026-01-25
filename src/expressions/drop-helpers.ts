export function extractArrayElementType(
  arrayTypeStr: string,
): string | undefined {
  // Array type format: [ElementType; initialized; capacity]
  if (!arrayTypeStr.startsWith("[") || !arrayTypeStr.includes("]")) {
    return undefined;
  }

  const inner = arrayTypeStr.slice(1, arrayTypeStr.lastIndexOf("]")).trim();
  const parts = inner.split(";");

  if (parts.length !== 3) return undefined;

  return parts[0]?.trim();
}

export function parseStructFieldTypes(
  fieldsStr: string,
): Map<string, string> | undefined {
  // Parse struct field definitions like "field1 : Type1, field2 : Type2"
  const fields = fieldsStr
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const fieldTypes = new Map<string, string>();

  for (const field of fields) {
    const colonIndex = field.indexOf(":");
    if (colonIndex === -1) continue;

    const fieldName = field.slice(0, colonIndex).trim();
    const fieldType = field.slice(colonIndex + 1).trim();
    fieldTypes.set(fieldName, fieldType);
  }

  return fieldTypes.size > 0 ? fieldTypes : undefined;
}

export function getDropFuncName(
  dropKey: string,
  cTypeMap: Map<string, number>,
  typeMap: Map<string, number>,
): string | undefined {
  return (cTypeMap.get(dropKey) || typeMap.get(dropKey)) as unknown as string;
}

export function getTypeNameForVar(
  varName: string,
  cTypeMap: Map<string, number>,
  typeMap: Map<string, number>,
): string | undefined {
  const typeNameKey = "__vartype__" + varName;
  const typeNameValue = cTypeMap.get(typeNameKey) || typeMap.get(typeNameKey);
  return typeof typeNameValue === "string"
    ? typeNameValue
    : (typeNameValue as unknown as string);
}
