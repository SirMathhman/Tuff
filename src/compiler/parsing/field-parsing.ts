/**
 * Shared field parsing utilities
 */

/**
 * Parse field definitions from a comma-separated string
 * e.g., "x : I32, y : I32" -> {x: "I32", y: "I32"}
 */
export function parseFieldsDefinition(fieldsStr: string): Map<string, string> {
  const fields = new Map<string, string>();
  const parts = fieldsStr.split(",");

  for (const part of parts) {
    const field = part.trim();
    if (!field) continue;

    const colonIndex = field.indexOf(":");
    if (colonIndex === -1) continue;

    const fieldName = field.slice(0, colonIndex).trim();
    const fieldType = field.slice(colonIndex + 1).trim();
    fields.set(fieldName, fieldType);
  }

  return fields;
}

/**
 * Parse field assignments from instantiation
 * e.g., "x: 3, y: 4" -> [["x", "3"], ["y", "4"]]
 */
export function parseFieldAssignments(
  fieldsStr: string,
): Array<[string, string]> {
  const assignments: Array<[string, string]> = [];
  const parts = fieldsStr.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const fieldName = trimmed.slice(0, colonIndex).trim();
    const fieldValue = trimmed.slice(colonIndex + 1).trim();
    assignments.push([fieldName, fieldValue]);
  }

  return assignments;
}
