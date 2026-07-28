/**
 * Runtime value types for the Tuff interpreter.
 * A discriminated union that replaces the raw `number` encoding.
 */
export type Value =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean };

/** Coerce a value to a number. Booleans become 1/0. */
export function toNumber(v: Value): number {
  switch (v.kind) {
    case "number":
      return v.value;
    case "boolean":
      return v.value ? 1 : 0;
  }
}
