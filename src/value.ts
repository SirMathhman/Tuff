export type Value =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "ref"; readonly target: string; readonly mutable: boolean }
  | { readonly kind: "array"; readonly elements: readonly Value[] };

export interface Binding {
  value: Value;
  mutable: boolean;
  /** Known numeric literal (static pass only); invalidated on reassignment. */
  literal?: number;
}

export function resolveRefChain(
  name: string,
  get: (name: string) => Binding | undefined,
): { name: string; binding: Binding } | null {
  const visited = new Set<string>();
  let currentName = name;
  let current = get(currentName);
  while (current && current.value.kind === "ref") {
    currentName = current.value.target;
    if (visited.has(currentName)) return null;
    visited.add(currentName);
    const next = get(currentName);
    if (!next) return null;
    current = next;
  }
  return current ? { name: currentName, binding: current } : null;
}
