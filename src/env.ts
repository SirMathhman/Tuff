/** The type of a runtime value. Booleans and numbers are distinct. */
export type ValueKind = "num" | "bool" | "array";

export interface Value {
  kind: ValueKind;
  /** Numeric representation: the number itself, or 1/0 for booleans. */
  num: number;
  /** Present only when kind is "array". */
  items?: Value[];
}

export interface Binding {
  value: Value;
  mutable: boolean;
  /** When set, this binding is a reference to a place (variable or array element). */
  place?: Place;
}

/**
 * A location a reference can point at: a variable, optionally followed by an
 * array index path (e.g. `array[0]`).
 */
export interface Place {
  variable: string;
  indices: number[];
}

/** Reads the value at a place, or undefined if the path is invalid. */
export function resolvePlace(env: Env, place: Place): Value | undefined {
  let current = env.get(place.variable)?.value;
  if (current === undefined) return undefined;
  for (const idx of place.indices) {
    if (current.kind !== "array") return undefined;
    current = current.items?.[idx];
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Writes a value to a place. Returns false if the path is invalid (unknown
 * variable, non-array in the path, or out-of-bounds index).
 */
export function writePlace(env: Env, place: Place, value: Value): boolean {
  const binding = env.get(place.variable);
  if (binding === undefined) return false;
  if (place.indices.length === 0) {
    binding.value = value;
    return true;
  }
  let container = binding.value;
  for (let i = 0; i < place.indices.length; i++) {
    const idx = place.indices[i];
    if (idx === undefined || container.kind !== "array") return false;
    const items = container.items;
    if (!items || idx < 0 || idx >= items.length) return false;
    if (i === place.indices.length - 1) {
      items[idx] = value;
      return true;
    }
    const next = items[idx];
    if (next === undefined) return false;
    container = next;
  }
  return false;
}

export type Env = Map<string, Binding>;
