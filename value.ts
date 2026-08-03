export type Value =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean };

export function toNumber(value: Value): number {
  return value.type === "number" ? value.value : value.value ? 1 : 0;
}

export function truthy(value: Value): boolean {
  return toNumber(value) !== 0;
}
