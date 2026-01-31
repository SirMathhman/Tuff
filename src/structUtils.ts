/** Utilities for handling struct definitions and instantiations. */

export function handleStructInstantiation(
  input: string,
): [string, Map<string, string>] {
  const map = new Map<string, string>();
  let i = 0;
  const result = input.replace(/[A-Z]\w*\s*\{[^}]*\}/g, (m) => {
    const value = m.substring(m.indexOf("{") + 1, m.lastIndexOf("}")).trim();
    const k = "__STRUCT_" + i + "__";
    map.set(k, "{field: " + value + "}");
    i++;
    return k;
  });
  return [result, map];
}
