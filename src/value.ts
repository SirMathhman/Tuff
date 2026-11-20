import type { Frame } from "./scope.ts";

/** A pointer to one binding's slot in a block's frame. It stays live while that block is open. */
export interface Reference {
  /** The frame of the block that declares the binding. */
  target: Frame<Value>;
  /** The binding's position within that frame. */
  index: number;
  /** Whether the reference may be written through (`&mut`). */
  mutable: boolean;
}

/** A runtime value: a number, a boolean, or a reference. */
export type Value = number | boolean | Reference;

/**
 * Whether a value is a reference.
 *
 * @param value - The value to test.
 * @returns True if the value is a reference.
 */
export function isReference(value: Value): value is Reference {
  return typeof value === "object";
}
