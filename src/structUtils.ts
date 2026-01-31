/** Utilities for handling struct definitions and instantiations. */

// Global registry to track struct field names
const structRegistry = new Map<string, string[]>();

export function registerStruct(structName: string, fields: string[]): void {
  structRegistry.set(structName, fields);
}

export function getStructFields(structName: string): string[] | undefined {
  return structRegistry.get(structName);
}

export function handleStructInstantiation(
  input: string,
): [string, Map<string, string>] {
  const map = new Map<string, string>();
  let i = 0;
  const result = input.replace(
    /([A-Z]\w*)\s*\{([^}]*)\}/g,
    (m, structName: string, values: string) => {
      const fields = getStructFields(structName);
      const valueList = values.split(",").map((v: string) => v.trim());
      let objectLit: string;
      if (fields && fields.length > 0) {
        // Map values to field names
        const pairs = fields.map(
          (f, idx) => f + ": " + (valueList[idx] || valueList[0]),
        );
        objectLit = "{" + pairs.join(", ") + "}";
      } else {
        // Fallback for unknown structs
        objectLit = "{field: " + valueList[0] + "}";
      }
      const k = "__STRUCT_" + i + "__";
      map.set(k, objectLit);
      i++;
      return k;
    },
  );
  return [result, map];
}
